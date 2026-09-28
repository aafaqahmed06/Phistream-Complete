/**
 * Admin API against real PostgreSQL (TEST_DATABASE_URL): staff mapping, role
 * checks, review actions with their events/audit/outbox rows, atomicity,
 * racing decisions, list filters, and the private detail view.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp, type App } from '../../src/app.js';
import type { Database } from '../../src/db/client.js';
import { publishApplicationForm } from '../../src/modules/applications/application-forms.repository.js';
import {
  createStaffAdministration,
  StaffProvisioningError,
} from '../../src/modules/admin/staff.repository.js';
import { TEST_ANSWERS, TEST_FORM } from '../helpers/fake-applications.js';
import { createTestStaffAuth } from '../helpers/staff-auth.js';
import { testConfig } from '../helpers/test-app.js';
import {
  connectAdmin,
  createTestDatabase,
  resetAndMigrate,
  TEST_DATABASE_URL,
} from '../helpers/test-database.js';

interface Created {
  data: { application: { id: string; reference: string }; statusAccess: { token: string } };
}

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

describe.skipIf(!TEST_DATABASE_URL)('admin API (PostgreSQL)', () => {
  let admin: pg.Client;
  let database: Database;
  let app: App;
  let auth: Awaited<ReturnType<typeof createTestStaffAuth>>;
  const staffIds: Record<'admin' | 'reviewer', string> = { admin: '', reviewer: '' };
  let tierId: string;

  beforeAll(async () => {
    admin = await connectAdmin();
    await resetAndMigrate(admin);
    auth = await createTestStaffAuth();
    database = createTestDatabase(6);
    app = await buildApp({
      config: testConfig({
        APPLICATION_RATE_LIMIT_MAX: '1000',
        CONTACT_RATE_LIMIT_MAX: '1000',
        RATE_LIMIT_MAX: '10000',
      }),
      database,
      staffTokenVerifier: auth.verifier,
    });

    const staff = createStaffAdministration(database.db);
    staffIds.admin = (
      await staff.add({
        authProviderId: 'sub-admin',
        email: 'Admin@Example.com',
        displayName: 'Ada Admin',
        role: 'ADMIN',
      })
    ).id;
    staffIds.reviewer = (
      await staff.add({
        authProviderId: 'sub-reviewer',
        email: 'reviewer@example.com',
        displayName: 'Rae Reviewer',
        role: 'REVIEWER',
      })
    ).id;
    await publishApplicationForm(database.db, { version: 'v1', definition: TEST_FORM });
    const tier = await admin.query<{ id: string }>(
      `insert into service_tiers (slug, name, description, is_active) values ('growth', 'Growth', 'd', true) returning id`,
    );
    tierId = tier.rows[0]!.id;
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  beforeEach(async () => {
    await admin.query('truncate leads, notification_events cascade');
    await admin.query(`delete from audit_logs where action like 'application.%'`);
  });

  /** "admin"/"reviewer" map to the provisioned staff; anything else is a raw subject. */
  const as = async (who: string) =>
    `Bearer ${await auth.tokenFor(who === 'admin' || who === 'reviewer' ? `sub-${who}` : who)}`;

  const get = async (url: string, who: 'admin' | 'reviewer' = 'admin') =>
    app.inject({ method: 'GET', url, headers: { authorization: await as(who) } });

  const post = async (url: string, who: 'admin' | 'reviewer' = 'reviewer', payload?: object) =>
    app.inject({
      method: 'POST',
      url,
      headers: { authorization: await as(who) },
      ...(payload ? { payload } : {}),
    });

  async function apply(body: Record<string, unknown> = {}) {
    const response = await app.inject({
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
    expect(response.statusCode).toBe(201);
    return response.json<Created>().data;
  }

  const rows = async <T extends pg.QueryResultRow>(text: string, values: unknown[] = []) =>
    (await admin.query<T>(text, values)).rows;

  describe('review workflow', () => {
    it('review → accept records events in order, audit entries, outbox, and public status', async () => {
      const { application, statusAccess } = await apply();
      const base = `/api/v1/admin/applications/${application.id}`;

      expect((await post(`${base}/review`)).statusCode).toBe(200);
      const accepted = await post(`${base}/accept`);
      expect(accepted.json()).toEqual({
        data: {
          id: application.id,
          status: 'SCHEDULING_OPEN',
          events: ['ACCEPTED', 'SCHEDULING_ENABLED'],
        },
      });

      expect(
        await rows(
          `select status, reviewed_by, accepted_at is not null as accepted from applications where id = $1`,
          [application.id],
        ),
      ).toEqual([{ status: 'SCHEDULING_OPEN', reviewed_by: staffIds.reviewer, accepted: true }]);

      expect(
        await rows(
          `select event_type, actor_type, actor_id from application_events
            where application_id = $1 order by created_at, id`,
          [application.id],
        ),
      ).toEqual([
        { event_type: 'SUBMITTED', actor_type: 'APPLICANT', actor_id: null },
        { event_type: 'REVIEW_STARTED', actor_type: 'STAFF', actor_id: staffIds.reviewer },
        { event_type: 'ACCEPTED', actor_type: 'STAFF', actor_id: staffIds.reviewer },
        { event_type: 'SCHEDULING_ENABLED', actor_type: 'SYSTEM', actor_id: null },
      ]);

      expect(
        await rows(
          `select action, actor_id, entity_type, entity_id, metadata from audit_logs
            where entity_id = $1 order by created_at`,
          [application.id],
        ),
      ).toEqual([
        {
          action: 'application.review_started',
          actor_id: staffIds.reviewer,
          entity_type: 'application',
          entity_id: application.id,
          metadata: { from: 'NEW', to: 'UNDER_REVIEW' },
        },
        {
          action: 'application.accepted',
          actor_id: staffIds.reviewer,
          entity_type: 'application',
          entity_id: application.id,
          metadata: { from: 'UNDER_REVIEW', to: 'SCHEDULING_OPEN' },
        },
      ]);

      expect(
        await rows(
          `select event_type from notification_events where subject_id = $1 order by event_type`,
          [application.id],
        ),
      ).toEqual([{ event_type: 'APPLICATION_ACCEPTED' }, { event_type: 'APPLICATION_SUBMITTED' }]);

      const status = await app.inject({
        method: 'GET',
        url: `/api/v1/applications/${application.id}/status`,
        headers: { authorization: `Bearer ${statusAccess.token}` },
      });
      expect(status.json<{ data: { status: string } }>().data.status).toBe('ACCEPTED');
    });

    it('reject stores the reason but never audits its text', async () => {
      const { application } = await apply();
      const base = `/api/v1/admin/applications/${application.id}`;
      await post(`${base}/review`);
      expect(
        (await post(`${base}/reject`, 'reviewer', { reason: 'Audience mismatch (internal)' }))
          .statusCode,
      ).toBe(200);

      expect(
        await rows('select status, rejection_reason from applications where id = $1', [
          application.id,
        ]),
      ).toEqual([{ status: 'REJECTED', rejection_reason: 'Audience mismatch (internal)' }]);
      const audit = await rows<{ metadata: unknown }>(
        `select metadata from audit_logs where action = 'application.rejected' and entity_id = $1`,
        [application.id],
      );
      expect(audit).toEqual([
        { metadata: { from: 'UNDER_REVIEW', to: 'REJECTED', reasonProvided: true } },
      ]);
    });

    it('notes are stored, audited by id, and never reach the public status endpoint', async () => {
      const { application, statusAccess } = await apply();
      const response = await post(
        `/api/v1/admin/applications/${application.id}/notes`,
        'reviewer',
        {
          body: 'SECRET-NOTE: strong fit',
        },
      );
      expect(response.statusCode).toBe(201);
      const noteId = response.json<{ data: { id: string } }>().data.id;

      expect(
        await rows('select author_id, body from application_notes where id = $1', [noteId]),
      ).toEqual([{ author_id: staffIds.reviewer, body: 'SECRET-NOTE: strong fit' }]);
      expect(
        await rows(`select metadata from audit_logs where action = 'application.note_added'`),
      ).toEqual([{ metadata: { noteId } }]);

      const status = await app.inject({
        method: 'GET',
        url: `/api/v1/applications/${application.id}/status`,
        headers: { authorization: `Bearer ${statusAccess.token}` },
      });
      expect(status.body).not.toContain('SECRET-NOTE');
    });

    it.each([
      ['accept a NEW application', 'accept', []],
      ['reject a NEW application', 'reject', []],
      ['review twice', 'review', ['review']],
      ['accept twice', 'accept', ['review', 'accept']],
      ['reject after acceptance', 'reject', ['review', 'accept']],
      ['accept after rejection', 'accept', ['review', 'reject']],
      ['review after rejection', 'review', ['review', 'reject']],
    ])('409s: %s, writing nothing', async (_, action, before) => {
      const { application } = await apply();
      const base = `/api/v1/admin/applications/${application.id}`;
      for (const step of before) expect((await post(`${base}/${step}`)).statusCode).toBe(200);
      const [snapshot] = await rows('select status, updated_at from applications where id = $1', [
        application.id,
      ]);
      const auditBefore = await rows('select count(*)::int as n from audit_logs');

      const response = await post(`${base}/${action}`);

      expect(response.statusCode).toBe(409);
      expect(
        await rows('select status, updated_at from applications where id = $1', [application.id]),
      ).toEqual([snapshot]);
      expect(await rows('select count(*)::int as n from audit_logs')).toEqual(auditBefore);
    });

    it('rolls back the whole decision if the audit entry cannot be written', async () => {
      const { application } = await apply();
      const base = `/api/v1/admin/applications/${application.id}`;
      await post(`${base}/review`);

      await admin.query(`alter table audit_logs add constraint test_block check (false) not valid`);
      try {
        expect((await post(`${base}/accept`)).statusCode).toBe(500);
      } finally {
        await admin.query('alter table audit_logs drop constraint test_block');
      }

      expect(
        await rows('select status, accepted_at from applications where id = $1', [application.id]),
      ).toEqual([{ status: 'UNDER_REVIEW', accepted_at: null }]);
      expect(
        await rows(
          `select count(*)::int as n from application_events where application_id = $1 and event_type in ('ACCEPTED', 'SCHEDULING_ENABLED')`,
          [application.id],
        ),
      ).toEqual([{ n: 0 }]);
      expect(
        await rows(
          `select count(*)::int as n from notification_events where event_type = 'APPLICATION_ACCEPTED'`,
        ),
      ).toEqual([{ n: 0 }]);
    });

    it('serializes racing accept/reject from two reviewers: exactly one wins', async () => {
      const { application } = await apply();
      const base = `/api/v1/admin/applications/${application.id}`;
      await post(`${base}/review`);
      const [adminToken, reviewerToken] = await Promise.all([as('admin'), as('reviewer')]);

      const blocker = await connectAdmin();
      try {
        await blocker.query('begin');
        await blocker.query('select id from applications where id = $1 for update', [
          application.id,
        ]);
        const racing = Promise.all([
          app.inject({
            method: 'POST',
            url: `${base}/accept`,
            headers: { authorization: adminToken },
          }),
          app.inject({
            method: 'POST',
            url: `${base}/reject`,
            headers: { authorization: reviewerToken },
          }),
        ]);
        await waitForLockWaiters(2);
        await blocker.query('commit');
        const statuses = (await racing).map((r) => r.statusCode).sort();

        expect(statuses).toEqual([200, 409]);
      } finally {
        await blocker.end();
      }
      expect(
        await rows(
          `select count(*)::int as n from audit_logs where entity_id = $1 and action in ('application.accepted', 'application.rejected')`,
          [application.id],
        ),
      ).toEqual([{ n: 1 }]);
    });
  });

  describe('private data access', () => {
    it('detail shows labelled answers, events with actors, notes, lead, and allowed actions', async () => {
      const { application } = await apply({
        serviceTierSlug: 'growth',
        source: 'instagram',
        phone: '+1 555 0100',
      });
      const other = await apply({ answers: { ...TEST_ANSWERS, about: 'Second try' } });
      const base = `/api/v1/admin/applications/${application.id}`;
      await post(`${base}/review`);
      await post(`${base}/notes`, 'reviewer', { body: 'Promising' });

      const response = await get(base, 'reviewer');
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const { data } = response.json<{
        data: Record<string, unknown> & {
          application: Record<string, unknown>;
          lead: Record<string, unknown>;
          answers: unknown[];
          events: { eventType: string; actor: unknown }[];
          notes: { body: string; author: { displayName: string } }[];
          availableActions: string[];
          otherApplications: { id: string }[];
        };
      }>();

      expect(data.application).toMatchObject({
        status: 'UNDER_REVIEW',
        reference: application.reference,
        formVersion: 'v1',
      });
      expect(data.lead).toMatchObject({
        email: 'jane@example.com',
        phone: '+1 555 0100',
        source: 'instagram',
      });
      expect(data.serviceTier).toEqual({ id: tierId, slug: 'growth', name: 'Growth' });
      expect(data.answers).toEqual([
        { questionKey: 'about', label: 'About', type: 'text', answer: 'I make videos.' },
        { questionKey: 'platform', label: 'Platform', type: 'single_choice', answer: 'instagram' },
        { questionKey: 'agree', label: 'Agree', type: 'boolean', answer: true },
      ]);
      expect(data.events.map((e) => [e.eventType, e.actor])).toEqual([
        ['SUBMITTED', null],
        ['REVIEW_STARTED', { id: staffIds.reviewer, displayName: 'Rae Reviewer' }],
      ]);
      expect(data.notes).toEqual([
        expect.objectContaining({
          body: 'Promising',
          author: { id: staffIds.reviewer, displayName: 'Rae Reviewer' },
        }),
      ]);
      expect(data.availableActions).toEqual(['accept', 'reject', 'note']);
      expect(data.otherApplications.map((a) => a.id)).toEqual([other.application.id]);
      expect(data.scheduling).toEqual({ session: null, meetings: [] });

      // Secrets never leave the database, even to staff.
      const tokenHash = await rows<{ token_hash: string }>(
        'select token_hash from application_access_tokens where application_id = $1',
        [application.id],
      );
      const fingerprint = await rows<{ submission_fingerprint: string }>(
        'select submission_fingerprint from applications where id = $1',
        [application.id],
      );
      expect(response.body).not.toContain(tokenHash[0]!.token_hash);
      expect(response.body).not.toContain(fingerprint[0]!.submission_fingerprint);
    });

    it('404s an unknown application', async () => {
      expect(
        (await get('/api/v1/admin/applications/00000000-0000-4000-8000-000000000999')).statusCode,
      ).toBe(404);
    });

    it('rejects callers who are not active staff, even with a valid identity', async () => {
      const { application } = await apply();
      const url = `/api/v1/admin/applications/${application.id}`;

      const stranger = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: await as('random-user') },
      });
      expect(stranger.statusCode).toBe(403);
      expect(stranger.body).not.toContain('jane@example.com');

      const anonymous = await app.inject({ method: 'GET', url });
      expect(anonymous.statusCode).toBe(401);
      expect(anonymous.body).not.toContain('jane@example.com');
    });

    it('deactivating staff revokes access on the next request', async () => {
      const staff = createStaffAdministration(database.db);
      await staff.add({
        authProviderId: 'sub-temp',
        email: 'temp@example.com',
        displayName: 'Temp',
        role: 'REVIEWER',
      });
      const token = await as('sub-temp');
      const list = () =>
        app.inject({
          method: 'GET',
          url: '/api/v1/admin/leads',
          headers: { authorization: token },
        });

      expect((await list()).statusCode).toBe(200);
      await staff.setActive('TEMP@example.com', false);
      expect((await list()).statusCode).toBe(403);
      await staff.setActive('temp@example.com', true);
      expect((await list()).statusCode).toBe(200);
    });
  });

  describe('lists and filters', () => {
    beforeEach(async () => {
      await apply({
        email: 'ana@example.com',
        name: 'Ana Growth',
        companyName: 'Acme 50% Off',
        source: 'instagram',
        serviceTierSlug: 'growth',
      });
      await apply({
        email: 'bo@example.com',
        name: 'Bo Brand',
        source: 'tiktok',
        campaign: 'spring',
      });
      const contact = await app.inject({
        method: 'POST',
        url: '/api/v1/contact',
        payload: {
          name: 'Cy Contact',
          email: 'cy_under@example.com',
          message: 'Hello',
          source: 'instagram',
        },
      });
      expect(contact.statusCode).toBe(202);
      expect(await rows("select 1 from leads where email = 'cy_under@example.com'")).toHaveLength(
        1,
      );
      await admin.query(`update leads set status = 'CONTACTED' where email = 'bo@example.com'`);
    });

    const emails = (body: string) =>
      (JSON.parse(body) as { data: { email?: string; lead?: { email: string } }[] }).data
        .map((row) => row.email ?? row.lead?.email)
        .sort();

    it('lists leads newest first with counts and totals', async () => {
      const response = await get('/api/v1/admin/leads?limit=2');
      const body = response.json<{
        data: { applicationCount: number; contactSubmissionCount: number }[];
        pagination: unknown;
      }>();

      expect(body.pagination).toEqual({ limit: 2, offset: 0, total: 3 });
      expect(body.data).toHaveLength(2);
      expect(response.body).toContain('"applicationCount"');
    });

    it.each([
      ['status=CONTACTED', ['bo@example.com']],
      ['source=INSTAGRAM', ['ana@example.com', 'cy_under@example.com']],
      ['campaign=spring', ['bo@example.com']],
      ['search=growth', ['ana@example.com']],
      ['search=ACME', ['ana@example.com']],
      ['search=50%25', ['ana@example.com']], // literal "%", not a wildcard
      ['search=_under', ['cy_under@example.com']], // literal "_"
      ['search=%25%25', []],
    ])('filters leads by %s', async (query, expected) => {
      const response = await get(`/api/v1/admin/leads?${query}`);
      expect(response.statusCode).toBe(200);
      expect(emails(response.body)).toEqual(expected);
    });

    it('filters leads by creation date range', async () => {
      await admin.query(
        `update leads set created_at = '2020-01-15T00:00:00Z' where email = 'ana@example.com'`,
      );
      const response = await get(
        '/api/v1/admin/leads?createdFrom=2020-01-01T00:00:00Z&createdTo=2020-02-01T00:00:00Z',
      );
      expect(emails(response.body)).toEqual(['ana@example.com']);
    });

    it.each([
      ['status=NEW', ['ana@example.com', 'bo@example.com']],
      ['source=tiktok', ['bo@example.com']],
      ['serviceTierId=TIER', ['ana@example.com']],
      ['serviceTierId=00000000-0000-4000-8000-000000000999', []],
    ])('filters applications by %s', async (query, expected) => {
      const response = await get(
        `/api/v1/admin/applications?${query.replace('TIER', tierId)}`,
        'reviewer',
      );
      expect(response.statusCode).toBe(200);
      expect(emails(response.body)).toEqual(expected);
    });

    it('filters applications by submission date range', async () => {
      await admin.query(
        `update applications set submitted_at = '2020-01-15T00:00:00Z'
          where lead_id = (select id from leads where email = 'bo@example.com')`,
      );
      const response = await get('/api/v1/admin/applications?submittedTo=2021-01-01T00:00:00Z');
      expect(emails(response.body)).toEqual(['bo@example.com']);
    });

    it('paginates applications', async () => {
      const first = await get('/api/v1/admin/applications?limit=1&offset=0');
      const second = await get('/api/v1/admin/applications?limit=1&offset=1');
      expect(first.json<{ pagination: { total: number } }>().pagination.total).toBe(2);
      expect(emails(first.body)).not.toEqual(emails(second.body));
    });
  });

  describe('audit logs', () => {
    it('lets admins read and filter the audit trail, with actors', async () => {
      const { application } = await apply();
      await post(`/api/v1/admin/applications/${application.id}/review`);

      const response = await get(`/api/v1/admin/audit-logs?entityId=${application.id}`);
      expect(response.statusCode).toBe(200);
      expect(response.json<{ data: unknown[] }>().data).toEqual([
        expect.objectContaining({
          action: 'application.review_started',
          entityType: 'application',
          entityId: application.id,
          actor: {
            id: staffIds.reviewer,
            displayName: 'Rae Reviewer',
            email: 'reviewer@example.com',
            role: 'REVIEWER',
          },
        }),
      ]);

      const staffEvents = await get('/api/v1/admin/audit-logs?action=staff.added');
      expect(
        staffEvents.json<{ data: { actor: unknown }[] }>().data.every((e) => e.actor === null),
      ).toBe(true);
    });

    it('is forbidden to reviewers', async () => {
      expect((await get('/api/v1/admin/audit-logs', 'reviewer')).statusCode).toBe(403);
    });
  });

  describe('staff provisioning', () => {
    it('audits every change and refuses duplicates', async () => {
      const staff = createStaffAdministration(database.db);
      const created = await staff.add({
        authProviderId: 'sub-prov',
        email: 'prov@example.com',
        displayName: 'Prov',
        role: 'REVIEWER',
      });
      await expect(
        staff.add({
          authProviderId: 'sub-other',
          email: 'PROV@example.com',
          displayName: 'Dup',
          role: 'ADMIN',
        }),
      ).rejects.toBeInstanceOf(StaffProvisioningError);
      await expect(
        staff.add({
          authProviderId: 'sub-prov',
          email: 'new@example.com',
          displayName: 'Dup',
          role: 'ADMIN',
        }),
      ).rejects.toBeInstanceOf(StaffProvisioningError);

      await staff.setRole('prov@example.com', 'ADMIN');
      await staff.setActive('prov@example.com', false);
      await staff.setActive('prov@example.com', false); // no-op, not audited twice
      await expect(staff.setRole('nobody@example.com', 'ADMIN')).rejects.toBeInstanceOf(
        StaffProvisioningError,
      );

      expect(
        await rows(
          `select action, actor_id, metadata from audit_logs where entity_id = $1 order by created_at`,
          [created.id],
        ),
      ).toEqual([
        { action: 'staff.added', actor_id: null, metadata: { role: 'REVIEWER', via: 'cli' } },
        {
          action: 'staff.role_changed',
          actor_id: null,
          metadata: { from: 'REVIEWER', to: 'ADMIN', via: 'cli' },
        },
        { action: 'staff.deactivated', actor_id: null, metadata: { via: 'cli' } },
      ]);
    });
  });
});
