/**
 * Privacy operations against real PostgreSQL: lead erasure (right to be
 * forgotten) and the retention policy.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp, type App } from '../../src/app.js';
import type { Database } from '../../src/db/client.js';
import {
  applyRetention,
  DEFAULT_RETENTION_POLICY,
} from '../../src/modules/admin/data-retention.js';
import { createStaffAdministration } from '../../src/modules/admin/staff.repository.js';
import { publishApplicationForm } from '../../src/modules/applications/application-forms.repository.js';
import { createApplicationReviewService } from '../../src/modules/applications/application-review.service.js';
import { createApplicationsRepository } from '../../src/modules/applications/applications.repository.js';
import { createNotificationDispatcher } from '../../src/modules/notifications/dispatcher.js';
import { createNotificationContext } from '../../src/modules/notifications/notification-context.js';
import { createNotificationsRepository } from '../../src/modules/notifications/notifications.repository.js';
import { TEST_ANSWERS, TEST_FORM } from '../helpers/fake-applications.js';
import { createFakeEmailProvider } from '../helpers/fake-notifications.js';
import { createTestStaffAuth } from '../helpers/staff-auth.js';
import { testConfig } from '../helpers/test-app.js';
import {
  connectAdmin,
  createTestDatabase,
  resetAndMigrate,
  TEST_DATABASE_URL,
} from '../helpers/test-database.js';

const PERSON = 'erase.me@example.com';

describe.skipIf(!TEST_DATABASE_URL)('privacy operations (PostgreSQL)', () => {
  let admin: pg.Client;
  let database: Database;
  let app: App;
  let auth: Awaited<ReturnType<typeof createTestStaffAuth>>;
  let adminId: string;

  beforeAll(async () => {
    admin = await connectAdmin();
    await resetAndMigrate(admin);
    auth = await createTestStaffAuth();
    database = createTestDatabase(4);
    app = await buildApp({
      config: testConfig({
        RATE_LIMIT_MAX: '10000',
        APPLICATION_RATE_LIMIT_MAX: '1000',
        CONTACT_RATE_LIMIT_MAX: '1000',
      }),
      database,
      staffTokenVerifier: auth.verifier,
    });
    const staff = createStaffAdministration(database.db);
    adminId = (
      await staff.add({
        authProviderId: 'sub-admin',
        email: 'admin@example.com',
        displayName: 'A',
        role: 'ADMIN',
      })
    ).id;
    await staff.add({
      authProviderId: 'sub-reviewer',
      email: 'rev@example.com',
      displayName: 'R',
      role: 'REVIEWER',
    });
    await publishApplicationForm(database.db, { version: 'v1', definition: TEST_FORM });
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  beforeEach(async () => {
    await admin.query(
      'truncate leads, notification_events, analytics_events, scheduling_webhook_events cascade',
    );
  });

  const rows = async (text: string, values: unknown[] = []): Promise<Record<string, unknown>[]> =>
    (await admin.query<Record<string, unknown>>(text, values)).rows;
  const count = async (table: string) =>
    Number((await rows(`select count(*)::int as n from ${table}`))[0]?.n);
  const as = async (who: 'admin' | 'reviewer') => ({
    authorization: `Bearer ${await auth.tokenFor(`sub-${who}`)}`,
  });

  /** A person with a contact message, a reviewed + accepted application, a meeting, emails sent. */
  async function personWithHistory() {
    await app.inject({
      method: 'POST',
      url: '/api/v1/contact',
      payload: { name: 'Erin', email: PERSON, message: 'Hi' },
    });
    const submitted = await app.inject({
      method: 'POST',
      url: '/api/v1/applications',
      payload: { formVersion: 'v1', name: 'Erin', email: PERSON, answers: TEST_ANSWERS },
    });
    const applicationId = submitted.json<{ data: { application: { id: string } } }>().data
      .application.id;
    const review = createApplicationReviewService({
      repository: createApplicationsRepository(database.db),
    });
    await review.startReview(applicationId, { staffId: adminId });
    await review.addNote(applicationId, { staffId: adminId }, 'Private note');
    await review.accept(applicationId, { staffId: adminId });
    await admin.query(
      `insert into meetings (application_id, provider, provider_event_id, starts_at, ends_at)
       values ($1, 'mock', 'bk-erase', now(), now() + interval '30 minutes')`,
      [applicationId],
    );
    await admin.query(
      `insert into analytics_events (event_name, anonymous_session_id, application_id) values ('application_submit', 'sess_erase_1', $1)`,
      [applicationId],
    );
    await createNotificationDispatcher({
      repository: createNotificationsRepository(database.db),
      context: createNotificationContext(database.db, { staffRecipients: ['team@example.com'] }),
      provider: createFakeEmailProvider(),
      scheduling: undefined,
      options: {
        from: 'x@example.com',
        replyTo: undefined,
        adminDashboardUrl: undefined,
        batchSize: 50,
        maxAttempts: 3,
      },
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    }).runOnce();
    const [lead] = await rows('select id from leads');
    return { leadId: (lead as { id: string }).id, applicationId };
  }

  describe('lead erasure', () => {
    it('removes the person and everything linked, keeping only anonymous and audit data', async () => {
      const { leadId, applicationId } = await personWithHistory();
      expect(
        await rows(`select count(*)::int as n from notification_deliveries where recipient = $1`, [
          PERSON,
        ]),
      ).toEqual([{ n: 1 }]);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/leads/${leadId}`,
        headers: await as('admin'),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          id: leadId,
          erased: true,
          removed: { applications: 1, contactSubmissions: 1, notificationEvents: 3 },
        },
      });

      for (const table of [
        'leads',
        'contact_submissions',
        'applications',
        'application_answers',
        'application_notes',
        'application_events',
        'application_access_tokens',
        'meetings',
        'notification_events',
        'notification_deliveries',
      ]) {
        expect(await count(table), table).toBe(0);
      }
      // The anonymous event survives, unlinked.
      expect(await rows('select application_id from analytics_events')).toEqual([
        { application_id: null },
      ]);

      // Nothing about the person remains anywhere in the database.
      const dump = JSON.stringify(
        await rows(
          `select to_jsonb(a) as r from audit_logs a union all select to_jsonb(e) from analytics_events e`,
        ),
      );
      expect(dump).not.toContain(PERSON);
      expect(dump).not.toContain('Private note');

      expect(
        await rows(
          `select action, actor_id, entity_type, metadata from audit_logs where entity_id = $1`,
          [leadId],
        ),
      ).toEqual([
        {
          action: 'lead.erased',
          actor_id: adminId,
          entity_type: 'lead',
          metadata: { applications: 1, contactSubmissions: 1, notificationEvents: 3 },
        },
      ]);
      // Earlier audit entries about the application stay (ids only).
      expect(
        await rows(`select count(*)::int as n from audit_logs where entity_id = $1`, [
          applicationId,
        ]),
      ).toEqual([{ n: 3 }]);
    });

    it('is ADMIN-only and 404s unknown leads', async () => {
      const { leadId } = await personWithHistory();
      const reviewer = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/leads/${leadId}`,
        headers: await as('reviewer'),
      });
      expect(reviewer.statusCode).toBe(403);
      expect(await count('leads')).toBe(1);

      const unknown = await app.inject({
        method: 'DELETE',
        url: '/api/v1/admin/leads/00000000-0000-4000-8000-000000000999',
        headers: await as('admin'),
      });
      expect(unknown.statusCode).toBe(404);
    });
  });

  describe('retention', () => {
    async function seedAged() {
      // First: its dispatcher run would otherwise process the aged PENDING row below.
      await personWithHistory();
      await admin.query(`
        insert into analytics_events (event_name, anonymous_session_id, created_at) values
          ('onboarding_view', 'sess_old_0001', now() - interval '400 days'),
          ('onboarding_view', 'sess_new_0001', now() - interval '10 days');
        insert into notification_events (event_type, subject_type, subject_id, status, processed_at, created_at) values
          ('CONTACT_RECEIVED', 'contact_submission', gen_random_uuid(), 'PROCESSED', now(), now() - interval '400 days'),
          ('CONTACT_RECEIVED', 'contact_submission', gen_random_uuid(), 'FAILED', null, now() - interval '400 days'),
          ('CONTACT_RECEIVED', 'contact_submission', gen_random_uuid(), 'PENDING', null, now() - interval '400 days'),
          ('CONTACT_RECEIVED', 'contact_submission', gen_random_uuid(), 'PROCESSED', now(), now() - interval '5 days');
        insert into scheduling_webhook_events (provider, provider_event_id, event_type, outcome, processed_at, received_at) values
          ('mock', 'old', 'BOOKING_CREATED', 'IGNORED', now(), now() - interval '400 days'),
          ('mock', 'new', 'BOOKING_CREATED', 'IGNORED', now(), now() - interval '1 day');
      `);
      await admin.query(
        `update application_access_tokens set expires_at = now() - interval '31 days'`,
      );
    }

    it('counts in a dry run without deleting', async () => {
      await seedAged();
      const before = await count('analytics_events');
      const result = await applyRetention(database.db, DEFAULT_RETENTION_POLICY, { dryRun: true });

      expect(result).toEqual({
        analyticsEvents: 1,
        notificationEvents: 2,
        schedulingWebhookEvents: 1,
        applicationAccessTokens: 1,
      });
      expect(await count('analytics_events')).toBe(before);
    });

    it('deletes only aged, settled operational data and audits the run', async () => {
      await seedAged();
      const result = await applyRetention(database.db, DEFAULT_RETENTION_POLICY, { dryRun: false });

      expect(result).toEqual({
        analyticsEvents: 1,
        notificationEvents: 2,
        schedulingWebhookEvents: 1,
        applicationAccessTokens: 1,
      });
      expect(
        await rows(
          `select anonymous_session_id from analytics_events where anonymous_session_id like 'sess_%' order by 1`,
        ),
      ).toEqual([
        { anonymous_session_id: 'sess_erase_1' },
        { anonymous_session_id: 'sess_new_0001' },
      ]);
      // A pending event is never deleted, however old.
      expect(
        await rows(
          `select status from notification_events where created_at < now() - interval '300 days'`,
        ),
      ).toEqual([{ status: 'PENDING' }]);
      expect(await rows(`select provider_event_id from scheduling_webhook_events`)).toEqual([
        { provider_event_id: 'new' },
      ]);
      // Business records are never touched by retention.
      expect(await count('leads')).toBe(1);
      expect(await count('applications')).toBe(1);

      expect(
        await rows(
          `select action, entity_type, metadata->'deleted' as deleted from audit_logs where action = 'retention.applied'`,
        ),
      ).toEqual([{ action: 'retention.applied', entity_type: 'system', deleted: result }]);
    });
  });
});
