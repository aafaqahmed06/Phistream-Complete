/**
 * Applications against real PostgreSQL (TEST_DATABASE_URL): migration upgrade
 * path, form versioning and immutability, end-to-end submission and status
 * access, the SQL behind duplicate/cap rules, and row-locked transitions.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp, type App } from '../../src/app.js';
import type { Database } from '../../src/db/client.js';
import { MIGRATIONS_FOLDER, runMigrations } from '../../src/db/migrator.js';
import { createApplicationLifecycle } from '../../src/modules/applications/application-lifecycle.js';
import {
  FormPublishError,
  publishApplicationForm,
} from '../../src/modules/applications/application-forms.repository.js';
import { createApplicationsRepository } from '../../src/modules/applications/applications.repository.js';
import { hashAccessToken } from '../../src/shared/security/access-tokens.js';
import { TEST_ANSWERS, TEST_FORM } from '../helpers/fake-applications.js';
import { testConfig } from '../helpers/test-app.js';
import {
  connectAdmin,
  createTestDatabase,
  resetAndMigrate,
  resetTestDatabase,
  TEST_CONNECTION,
  TEST_DATABASE_URL,
} from '../helpers/test-database.js';

interface Created {
  data: {
    application: { id: string; reference: string };
    statusAccess: { token: string; expiresAt: string };
  };
}

const STAFF_ID = '00000000-0000-4000-8000-000000000501';

/** Waits until `n` backends of this database are blocked on a lock. */
async function waitForLockWaiters(n: number, timeoutMs = 5000): Promise<void> {
  const probe = await connectAdmin();
  try {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const { rows } = await probe.query<{ waiting: number }>(
        `select count(*)::int as waiting from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'`,
      );
      if ((rows[0]?.waiting ?? 0) >= n) return;
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${n} lock waiters`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  } finally {
    await probe.end();
  }
}

describe.skipIf(!TEST_DATABASE_URL)('applications (PostgreSQL)', () => {
  let admin: pg.Client;

  beforeAll(async () => {
    admin = await connectAdmin();
  });

  afterAll(async () => {
    await admin.end();
  });

  describe('migration 0003 on a database with existing applications', () => {
    it('registers legacy form versions as RETIRED so the new foreign key holds', async () => {
      await resetTestDatabase(admin);
      // Migrate only up to 0002 (before application_forms existed).
      const partial = mkdtempSync(join(tmpdir(), 'phistream-migrations-'));
      try {
        cpSync(MIGRATIONS_FOLDER, partial, { recursive: true });
        const journalPath = join(partial, 'meta', '_journal.json');
        const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: unknown[] };
        journal.entries = journal.entries.slice(0, 3);
        writeFileSync(journalPath, JSON.stringify(journal));
        await runMigrations(TEST_DATABASE_URL ?? '', TEST_CONNECTION, partial);
      } finally {
        rmSync(partial, { recursive: true, force: true });
      }

      const lead = await admin.query<{ id: string }>(
        `insert into leads (email, full_name) values ('legacy@example.com', 'Legacy') returning id`,
      );
      await admin.query(
        `insert into applications (reference, lead_id, form_version) values ('LEGACY-1', $1, 'legacy-v1')`,
        [lead.rows[0]?.id],
      );

      const result = await runMigrations(TEST_DATABASE_URL ?? '', TEST_CONNECTION);
      expect(result.applied).toBeGreaterThanOrEqual(1);

      const forms = await admin.query(
        `select version, status, definition->>'legacyPlaceholder' as legacy from application_forms`,
      );
      expect(forms.rows).toEqual([{ version: 'legacy-v1', status: 'RETIRED', legacy: 'true' }]);
    });
  });

  describe('with a migrated database', () => {
    let database: Database;
    let app: App;

    beforeAll(async () => {
      await resetAndMigrate(admin);
      database = createTestDatabase(6);
      app = await buildApp({
        config: testConfig({ APPLICATION_RATE_LIMIT_MAX: '1000' }),
        database,
      });
      await admin.query(
        `insert into staff_users (id, auth_provider_id, email, display_name, role)
         values ($1, 'test-staff', 'staff@example.com', 'Staff', 'REVIEWER')`,
        [STAFF_ID],
      );
      await admin.query(
        `insert into service_tiers (slug, name, description, is_active) values
           ('growth', 'Growth', 'd', true), ('retired-tier', 'Retired', 'd', false)`,
      );
    });

    afterAll(async () => {
      await app.close(); // also closes `database`
    });

    beforeEach(async () => {
      await admin.query('truncate leads, notification_events cascade');
      await admin.query('delete from application_forms');
      await publishApplicationForm(database.db, { version: 'v1', definition: TEST_FORM });
    });

    const submit = (body: Record<string, unknown> = {}) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/applications',
        payload: {
          formVersion: 'v1',
          name: 'Jane Doe',
          email: 'jane@example.com',
          answers: TEST_ANSWERS,
          ...body,
        },
      });

    const status = (id: string, token: string) =>
      app.inject({
        method: 'GET',
        url: `/api/v1/applications/${id}/status`,
        headers: { authorization: `Bearer ${token}` },
      });

    const count = async (table: string) =>
      Number((await admin.query<{ n: string }>(`select count(*) as n from ${table}`)).rows[0]?.n);

    describe('form versions', () => {
      it('serves the active version', async () => {
        const response = await app.inject('/api/v1/applications/form');
        expect(response.json<{ data: { version: string } }>().data.version).toBe('v1');
      });

      it('publishing retires the previous version and old submissions are refused', async () => {
        const result = await publishApplicationForm(database.db, {
          version: 'v2',
          definition: TEST_FORM,
        });
        expect(result.retired).toBe('v1');

        const forms = await admin.query(
          'select version, status, retired_at is not null as retired from application_forms order by version',
        );
        expect(forms.rows).toEqual([
          { version: 'v1', status: 'RETIRED', retired: true },
          { version: 'v2', status: 'ACTIVE', retired: false },
        ]);

        const outdated = await submit({ formVersion: 'v1' });
        expect(outdated.statusCode).toBe(409);
        expect((await submit({ formVersion: 'v2' })).statusCode).toBe(201);
      });

      it('refuses to reuse a version name or publish an invalid definition', async () => {
        await expect(
          publishApplicationForm(database.db, { version: 'v1', definition: TEST_FORM }),
        ).rejects.toBeInstanceOf(FormPublishError);
        await expect(
          publishApplicationForm(database.db, { version: 'v9', definition: { questions: [] } }),
        ).rejects.toBeInstanceOf(FormPublishError);
        await expect(
          publishApplicationForm(database.db, { version: 'bad version!', definition: TEST_FORM }),
        ).rejects.toBeInstanceOf(FormPublishError);
      });

      it('makes published definitions immutable in the database', async () => {
        await expect(
          admin.query(
            `update application_forms set definition = '{"questions": []}' where version = 'v1'`,
          ),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
          admin.query(`update application_forms set version = 'v1b' where version = 'v1'`),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
          admin.query(`update application_forms set status = 'DRAFT' where version = 'v1'`),
        ).rejects.toMatchObject({ code: '23514' });
        // Retiring is allowed.
        await admin.query(
          `update application_forms set status = 'RETIRED', retired_at = now() where version = 'v1'`,
        );
      });

      it('lets drafts be edited', async () => {
        await admin.query(
          `insert into application_forms (version, definition) values ('draft-1', '{"questions": []}')`,
        );
        await admin.query(
          `update application_forms set definition = '{"questions": [1]}' where version = 'draft-1'`,
        );
      });

      it('allows only one ACTIVE version', async () => {
        await expect(
          admin.query(
            `insert into application_forms (version, status, definition, published_at)
             values ('v-other', 'ACTIVE', '{}', now())`,
          ),
        ).rejects.toMatchObject({ code: '23505' });
      });

      it('rejects applications for unknown form versions', async () => {
        const lead = await admin.query<{ id: string }>(
          `insert into leads (email, full_name) values ('fk@example.com', 'X') returning id`,
        );
        await expect(
          admin.query(
            `insert into applications (reference, lead_id, form_version) values ('FK-1', $1, 'nope')`,
            [lead.rows[0]?.id],
          ),
        ).rejects.toMatchObject({ code: '23503' });
      });
    });

    describe('submission', () => {
      it('writes the application, versioned answers, event, token hash and notification atomically', async () => {
        const response = await submit({
          serviceTierSlug: 'growth',
          source: 'instagram',
          answers: { ...TEST_ANSWERS, followers: 1200, goals: ['growth', 'brand'] },
        });
        expect(response.statusCode).toBe(201);
        const created = response.json<Created>().data;

        const application = await admin.query(
          `select a.status, a.form_version, a.reference, t.slug as tier, l.email, l.source,
                  a.submission_fingerprint ~ '^[0-9a-f]{64}$' as fingerprinted
             from applications a
             join leads l on l.id = a.lead_id
             join service_tiers t on t.id = a.service_tier_id
            where a.id = $1`,
          [created.application.id],
        );
        expect(application.rows[0]).toEqual({
          status: 'NEW',
          form_version: 'v1',
          reference: created.application.reference,
          tier: 'growth',
          email: 'jane@example.com',
          source: 'instagram',
          fingerprinted: true,
        });

        const answers = await admin.query(
          `select question_key, answer from application_answers where application_id = $1 order by question_key`,
          [created.application.id],
        );
        expect(answers.rows).toEqual([
          { question_key: 'about', answer: 'I make videos.' },
          { question_key: 'agree', answer: true },
          { question_key: 'followers', answer: 1200 },
          { question_key: 'goals', answer: ['growth', 'brand'] },
          { question_key: 'platform', answer: 'instagram' },
        ]);

        const events = await admin.query(
          `select event_type, actor_type, actor_id, metadata from application_events where application_id = $1`,
          [created.application.id],
        );
        expect(events.rows).toEqual([
          {
            event_type: 'SUBMITTED',
            actor_type: 'APPLICANT',
            actor_id: null,
            metadata: { formVersion: 'v1' },
          },
        ]);

        const tokens = await admin.query<{ token_hash: string; purpose: string }>(
          `select token_hash, purpose from application_access_tokens where application_id = $1`,
          [created.application.id],
        );
        expect(tokens.rows).toEqual([
          { token_hash: hashAccessToken(created.statusAccess.token), purpose: 'STATUS' },
        ]);
        // The raw token is stored nowhere.
        const dump = await admin.query(
          `select count(*)::int as n from application_access_tokens where token_hash = $1`,
          [created.statusAccess.token],
        );
        expect(dump.rows[0]).toEqual({ n: 0 });

        const notifications = await admin.query(
          'select event_type, subject_type, subject_id from notification_events',
        );
        expect(notifications.rows).toEqual([
          {
            event_type: 'APPLICATION_SUBMITTED',
            subject_type: 'application',
            subject_id: created.application.id,
          },
        ]);
      });

      it('rejects inactive service tiers', async () => {
        const response = await submit({ serviceTierSlug: 'retired-tier' });
        expect(response.statusCode).toBe(400);
        expect(await count('applications')).toBe(0);
      });

      it('shares leads with the contact form', async () => {
        await app.inject({
          method: 'POST',
          url: '/api/v1/contact',
          payload: { name: 'Jane', email: 'JANE@example.com', message: 'Hi' },
        });
        await submit();
        expect(await count('leads')).toBe(1);
      });

      it('409s an identical resubmission and rolls back nothing else', async () => {
        await submit();
        const again = await submit({ name: 'Jane D.' });

        expect(again.statusCode).toBe(409);
        expect(await count('applications')).toBe(1);
        expect(await count('application_access_tokens')).toBe(1);
      });

      it('caps concurrent applications for one new email and creates one lead', async () => {
        const responses = await Promise.all(
          Array.from({ length: 5 }, (_, i) =>
            submit({ email: 'burst@example.com', answers: { ...TEST_ANSWERS, about: `v${i}` } }),
          ),
        );

        expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 201, 201, 429, 429]);
        const leads = await admin.query(
          `select count(*)::int as n from leads where email = 'burst@example.com'`,
        );
        expect(leads.rows[0]).toEqual({ n: 1 });
        expect(await count('applications')).toBe(3);
      });

      it('writes nothing if a later step fails', async () => {
        await admin.query(
          `alter table notification_events add constraint test_block check (false) not valid`,
        );
        try {
          expect((await submit()).statusCode).toBe(500);
        } finally {
          await admin.query('alter table notification_events drop constraint test_block');
        }
        for (const table of [
          'leads',
          'applications',
          'application_answers',
          'application_events',
          'application_access_tokens',
        ]) {
          expect(await count(table), table).toBe(0);
        }
      });
    });

    describe('status access', () => {
      async function created() {
        return (await submit()).json<Created>().data;
      }

      it('serves the public status to the token holder', async () => {
        const { application, statusAccess } = await created();
        const response = await status(application.id, statusAccess.token);

        expect(response.statusCode).toBe(200);
        expect(response.json<{ data: { status: string; reference: string } }>().data).toMatchObject(
          {
            status: 'UNDER_REVIEW',
            reference: application.reference,
          },
        );
      });

      it.each([
        [
          'expired',
          `update application_access_tokens set expires_at = now() - interval '1 second'`,
        ],
        ['revoked', `update application_access_tokens set revoked_at = now()`],
      ])('404s a %s token', async (_, statement) => {
        const { application, statusAccess } = await created();
        await admin.query(statement);
        expect((await status(application.id, statusAccess.token)).statusCode).toBe(404);
      });

      it("404s another application's token", async () => {
        const first = await created();
        const second = (await submit({ email: 'second@example.com' })).json<Created>().data;
        expect((await status(first.application.id, second.statusAccess.token)).statusCode).toBe(
          404,
        );
      });

      it('deletes tokens with the lead (retention requests)', async () => {
        await created();
        await admin.query('delete from leads');
        expect(await count('application_access_tokens')).toBe(0);
        expect(await count('application_answers')).toBe(0);
      });
    });

    describe('lifecycle transitions', () => {
      let lifecycle: ReturnType<typeof createApplicationLifecycle>;

      beforeAll(() => {
        lifecycle = createApplicationLifecycle({
          repository: createApplicationsRepository(database.db),
        });
      });

      const staff = { type: 'STAFF', id: STAFF_ID } as const;

      async function applicationId() {
        return (await submit()).json<Created>().data.application.id;
      }

      it('records decision fields and events', async () => {
        const id = await applicationId();
        await lifecycle.transition({ applicationId: id, to: 'UNDER_REVIEW', actor: staff });
        await lifecycle.transition({ applicationId: id, to: 'ACCEPTED', actor: staff });

        const row = await admin.query(
          `select status, reviewed_by, reviewed_at is not null as reviewed, accepted_at is not null as accepted
             from applications where id = $1`,
          [id],
        );
        expect(row.rows[0]).toEqual({
          status: 'ACCEPTED',
          reviewed_by: STAFF_ID,
          reviewed: true,
          accepted: true,
        });
        const events = await admin.query(
          `select event_type, actor_type, actor_id, metadata from application_events
            where application_id = $1 order by created_at`,
          [id],
        );
        // Each step is its own transaction, so created_at orders them.
        expect(events.rows.map((e: { event_type: string }) => e.event_type)).toEqual([
          'SUBMITTED',
          'REVIEW_STARTED',
          'ACCEPTED',
        ]);
        expect(events.rows[2]).toMatchObject({
          actor_type: 'STAFF',
          actor_id: STAFF_ID,
          metadata: { from: 'UNDER_REVIEW', to: 'ACCEPTED' },
        });
      });

      it('keeps the rejection reason through archival (relaxed constraint)', async () => {
        const id = await applicationId();
        await lifecycle.transition({ applicationId: id, to: 'UNDER_REVIEW', actor: staff });
        await lifecycle.transition({
          applicationId: id,
          to: 'REJECTED',
          actor: staff,
          rejectionReason: 'Not now',
        });
        await lifecycle.transition({ applicationId: id, to: 'ARCHIVED', actor: staff });

        const row = await admin.query(
          'select status, rejection_reason from applications where id = $1',
          [id],
        );
        expect(row.rows[0]).toEqual({ status: 'ARCHIVED', rejection_reason: 'Not now' });
      });

      it('refuses invalid moves without writing', async () => {
        const id = await applicationId();
        await expect(
          lifecycle.transition({ applicationId: id, to: 'ACCEPTED', actor: staff }),
        ).rejects.toMatchObject({ statusCode: 409 });

        const row = await admin.query('select status from applications where id = $1', [id]);
        expect(row.rows[0]).toEqual({ status: 'NEW' });
        const events = await admin.query(
          'select count(*)::int as n from application_events where application_id = $1',
          [id],
        );
        expect(events.rows[0]).toEqual({ n: 1 });
      });

      it('serializes racing decisions: exactly one wins', async () => {
        const id = await applicationId();
        await lifecycle.transition({ applicationId: id, to: 'UNDER_REVIEW', actor: staff });

        // Force a real race: hold the row lock on a separate connection while
        // both decisions start, and release it only once both are waiting on
        // PostgreSQL. Without SELECT ... FOR UPDATE both would read
        // UNDER_REVIEW and both would "win".
        const blocker = await connectAdmin();
        try {
          await blocker.query('begin');
          await blocker.query('select id from applications where id = $1 for update', [id]);

          const racing = Promise.allSettled([
            lifecycle.transition({ applicationId: id, to: 'ACCEPTED', actor: staff }),
            lifecycle.transition({
              applicationId: id,
              to: 'REJECTED',
              actor: staff,
              rejectionReason: 'x',
            }),
          ]);
          await waitForLockWaiters(2);
          await blocker.query('commit');
          const results = await racing;

          expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
          expect(results.find((r) => r.status === 'rejected')).toMatchObject({
            reason: { statusCode: 409 },
          });
        } finally {
          await blocker.end();
        }
        const decisions = await admin.query(
          `select count(*)::int as n from application_events
            where application_id = $1 and event_type in ('ACCEPTED', 'REJECTED')`,
          [id],
        );
        expect(decisions.rows[0]).toEqual({ n: 1 });
      });

      it('404s an unknown application', async () => {
        await expect(
          lifecycle.transition({
            applicationId: '00000000-0000-4000-8000-000000000999',
            to: 'UNDER_REVIEW',
            actor: staff,
          }),
        ).rejects.toMatchObject({ statusCode: 404 });
      });
    });
  });
});
