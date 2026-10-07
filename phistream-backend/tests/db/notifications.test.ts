/**
 * Notifications against real PostgreSQL (TEST_DATABASE_URL): outbox events
 * produced by the real flows, claimed with the real SQL (leases, SKIP
 * LOCKED), sent through a fake email provider, with delivery bookkeeping,
 * retries, dead letters, and the admin endpoints.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp, type App } from '../../src/app.js';
import type { Database } from '../../src/db/client.js';
import { createStaffAdministration } from '../../src/modules/admin/staff.repository.js';
import { publishApplicationForm } from '../../src/modules/applications/application-forms.repository.js';
import { createApplicationReviewService } from '../../src/modules/applications/application-review.service.js';
import { createApplicationsRepository } from '../../src/modules/applications/applications.repository.js';
import { createNotificationDispatcher } from '../../src/modules/notifications/dispatcher.js';
import { createNotificationContext } from '../../src/modules/notifications/notification-context.js';
import { createNotificationsRepository } from '../../src/modules/notifications/notifications.repository.js';
import { createSchedulingRepository } from '../../src/modules/scheduling/scheduling.repository.js';
import { createSchedulingService } from '../../src/modules/scheduling/scheduling.service.js';
import { EmailSendError } from '../../src/providers/email/email-provider.js';
import {
  createMockSchedulingProvider,
  signMockWebhook,
} from '../../src/providers/scheduling/mock.js';
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

const MOCK_SECRET = 'mock-scheduling-secret-for-tests';
const PAGE_URL = 'https://phistream.example/schedule';
const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };

describe.skipIf(!TEST_DATABASE_URL)('notifications (PostgreSQL)', () => {
  let admin: pg.Client;
  let database: Database;
  let app: App;
  let auth: Awaited<ReturnType<typeof createTestStaffAuth>>;
  let reviewerId: string;
  const scheduling = createMockSchedulingProvider({ webhookSecret: MOCK_SECRET });

  beforeAll(async () => {
    admin = await connectAdmin();
    await resetAndMigrate(admin);
    auth = await createTestStaffAuth();
    database = createTestDatabase(8);
    app = await buildApp({
      config: testConfig({
        APPLICATION_RATE_LIMIT_MAX: '1000',
        CONTACT_RATE_LIMIT_MAX: '1000',
        RATE_LIMIT_MAX: '10000',
        SCHEDULING_PAGE_URL: PAGE_URL,
      }),
      database,
      staffTokenVerifier: auth.verifier,
      schedulingProvider: scheduling,
    });
    const staff = createStaffAdministration(database.db);
    await staff.add({
      authProviderId: 'sub-admin',
      email: 'boss@example.com',
      displayName: 'Boss',
      role: 'ADMIN',
    });
    reviewerId = (
      await staff.add({
        authProviderId: 'sub-reviewer',
        email: 'rev@example.com',
        displayName: 'Rev',
        role: 'REVIEWER',
      })
    ).id;
    await publishApplicationForm(database.db, { version: 'v1', definition: TEST_FORM });
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  beforeEach(async () => {
    await admin.query('truncate leads, notification_events, scheduling_webhook_events cascade');
  });

  function dispatcherWith(options: { staffRecipients?: string[]; maxAttempts?: number } = {}) {
    const provider = createFakeEmailProvider();
    const dispatcher = createNotificationDispatcher({
      repository: createNotificationsRepository(database.db),
      context: createNotificationContext(database.db, {
        staffRecipients: options.staffRecipients ?? ['team@example.com'],
      }),
      provider,
      scheduling: createSchedulingService({
        repository: createSchedulingRepository(database.db, scheduling.name),
        provider: scheduling,
        tokenTtlMs: 72 * 3_600_000,
        pageUrl: PAGE_URL,
        logger: silent,
      }),
      options: {
        from: 'Phistream Studio <hello@mail.example.com>',
        replyTo: undefined,
        adminDashboardUrl: 'https://admin.example.com',
        batchSize: 50,
        maxAttempts: options.maxAttempts ?? 3,
      },
      logger: silent,
    });
    return { dispatcher, provider };
  }

  const rows = async <T extends pg.QueryResultRow>(text: string, values: unknown[] = []) =>
    (await admin.query<T>(text, values)).rows;

  async function submitApplication(email = 'jane@example.com') {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/applications',
      payload: {
        formVersion: 'v1',
        name: 'Jane Doe',
        email,
        answers: { ...TEST_ANSWERS, about: `about ${email}` },
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ data: { application: { id: string } } }>().data.application.id;
  }

  const review = () =>
    createApplicationReviewService({ repository: createApplicationsRepository(database.db) });

  it('contact received → staff email, delivery recorded, event processed, nothing sent twice', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/contact',
      payload: { name: 'Sam Sender', email: 'sam@example.com', message: 'Hello team' },
    });
    const { dispatcher, provider } = dispatcherWith();

    expect(await dispatcher.runOnce()).toMatchObject({ claimed: 1, processed: 1 });
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]).toMatchObject({
      to: ['team@example.com'],
      replyTo: 'sam@example.com',
    });
    expect(provider.sent[0]?.text).toContain('Hello team');

    expect(
      await rows(
        `select template, recipient, provider, status, attempts, provider_message_id, sent_at is not null as sent from notification_deliveries`,
      ),
    ).toEqual([
      {
        template: 'staff.contact_received',
        recipient: 'team@example.com',
        provider: 'fake',
        status: 'SENT',
        attempts: 1,
        provider_message_id: 'fake_1',
        sent: true,
      },
    ]);
    expect(
      await rows(
        `select status, attempts, locked_until, processed_at is not null as done from notification_events`,
      ),
    ).toEqual([{ status: 'PROCESSED', attempts: 1, locked_until: null, done: true }]);

    expect((await dispatcher.runOnce()).claimed).toBe(0);
    expect(provider.sent).toHaveLength(1);
  });

  it('full applicant journey: submitted → accepted (with a working scheduling link) → meeting booked', async () => {
    const applicationId = await submitApplication();
    const { dispatcher, provider } = dispatcherWith();
    await dispatcher.runOnce();
    expect(provider.sent.map((m) => m.tags?.template)).toEqual(['staff_application_submitted']);

    await review().startReview(applicationId, { staffId: reviewerId });
    await review().accept(applicationId, { staffId: reviewerId });
    await dispatcher.runOnce();

    const acceptance = provider.sent.at(-1);
    expect(acceptance?.to).toEqual(['jane@example.com']);
    const link = /https:\/\/phistream\.example\/schedule#token=([A-Za-z0-9_-]{43})/.exec(
      acceptance?.text ?? '',
    );
    expect(link).not.toBeNull();
    const token = link?.[1] ?? '';

    // The emailed link works: the applicant opens the booking page and books.
    const session = await app.inject({
      method: 'GET',
      url: '/api/v1/scheduling/session',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(session.statusCode).toBe(200);
    const bookingRef = new URL(
      session.json<{ data: { schedulingUrl: string } }>().data.schedulingUrl,
    ).searchParams.get('ref');
    const body = JSON.stringify({
      id: 'evt-journey',
      type: 'BOOKING_CREATED',
      bookingRef,
      booking: {
        id: 'bk-journey',
        startsAt: '2026-07-05T15:00:00Z',
        endsAt: '2026-07-05T15:30:00Z',
        meetingUrl: 'https://meet.example.com/j',
      },
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/scheduling/mock',
      headers: signMockWebhook(MOCK_SECRET, body),
      payload: body,
    });

    await dispatcher.runOnce();
    expect(provider.sent.slice(-2).map((m) => [m.tags?.template, m.to[0]])).toEqual([
      ['applicant_meeting_booked', 'jane@example.com'],
      ['staff_meeting_booked', 'team@example.com'],
    ]);
    expect(provider.sent.at(-2)?.html).toContain('https://meet.example.com/j');

    // The scheduling link was issued by the system and audited.
    expect(
      await rows(
        `select actor_id from audit_logs where action = 'application.scheduling_access_issued' and entity_id = $1`,
        [applicationId],
      ),
    ).toEqual([{ actor_id: null }]);
    expect(
      await rows(`select count(*)::int as n from notification_events where status <> 'PROCESSED'`),
    ).toEqual([{ n: 0 }]);
  });

  it('rejection email never contains the internal reason', async () => {
    const applicationId = await submitApplication('rejected@example.com');
    await review().startReview(applicationId, { staffId: reviewerId });
    await review().reject(applicationId, { staffId: reviewerId }, 'INTERNAL-REASON-DO-NOT-SEND');
    const { dispatcher, provider } = dispatcherWith();
    await dispatcher.runOnce();

    const rejection = provider.sent.find(
      (m) => m.tags?.template === 'applicant_application_rejected',
    );
    expect(rejection?.to).toEqual(['rejected@example.com']);
    expect(`${rejection?.html ?? ''}${rejection?.text ?? ''}`).not.toContain('INTERNAL-REASON');
  });

  it('two concurrent dispatchers never send the same notification twice', async () => {
    for (let i = 0; i < 6; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/contact',
        payload: { name: `Person ${i}`, email: `p${i}@example.com`, message: `Message ${i}` },
      });
    }
    const first = dispatcherWith();
    const second = dispatcherWith();
    const [a, b] = await Promise.all([first.dispatcher.runOnce(), second.dispatcher.runOnce()]);

    expect(a.claimed + b.claimed).toBe(6);
    expect(first.provider.sent.length + second.provider.sent.length).toBe(6);
    expect(
      await rows(`select count(*)::int as n from notification_deliveries where status = 'SENT'`),
    ).toEqual([{ n: 6 }]);
  });

  it('respects leases: a crashed worker’s events are picked up only after the lease expires', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/contact',
      payload: { name: 'L', email: 'l@example.com', message: 'm' },
    });
    const repository = createNotificationsRepository(database.db);
    expect(await repository.claimDue({ limit: 10, leaseMs: 60_000 })).toHaveLength(1); // then "crash"

    const { dispatcher, provider } = dispatcherWith();
    expect((await dispatcher.runOnce()).claimed).toBe(0);

    await admin.query(`update notification_events set locked_until = now() - interval '1 second'`);
    expect(await dispatcher.runOnce()).toMatchObject({ claimed: 1, processed: 1 });
    expect(provider.sent).toHaveLength(1);
    expect(await rows('select attempts from notification_events')).toEqual([{ attempts: 2 }]);
  });

  it('records retries and dead letters in the database', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/contact',
      payload: { name: 'R', email: 'r@example.com', message: 'm' },
    });
    const { dispatcher, provider } = dispatcherWith({ maxAttempts: 2 });
    provider.failNext(new EmailSendError('resend_503', true), 2);

    await dispatcher.runOnce();
    const [retrying] = await rows<{
      status: string;
      attempts: number;
      last_error: string;
      retry_in_seconds: number;
    }>(
      `select status, attempts, last_error,
              round(extract(epoch from next_attempt_at - now()))::int as retry_in_seconds
         from notification_events`,
    );
    expect(retrying).toMatchObject({ status: 'PENDING', attempts: 1, last_error: 'resend_503' });
    // Scheduled on the database clock, one backoff step (60 s) ahead.
    expect(retrying!.retry_in_seconds).toBeGreaterThanOrEqual(58);
    expect(retrying!.retry_in_seconds).toBeLessThanOrEqual(60);
    expect(await rows('select status, last_error, attempts from notification_deliveries')).toEqual([
      { status: 'FAILED', last_error: 'resend_503', attempts: 1 },
    ]);

    expect((await dispatcher.runOnce()).claimed).toBe(0); // not due yet
    await admin.query(
      `update notification_events set next_attempt_at = now() - interval '1 second'`,
    );
    await dispatcher.runOnce();
    expect(await rows('select status, attempts, last_error from notification_events')).toEqual([
      { status: 'FAILED', attempts: 2, last_error: 'resend_503' },
    ]);
  });

  describe('admin endpoints', () => {
    const as = async (who: 'admin' | 'reviewer') => ({
      authorization: `Bearer ${await auth.tokenFor(`sub-${who}`)}`,
    });

    async function deadLetter() {
      await app.inject({
        method: 'POST',
        url: '/api/v1/contact',
        payload: { name: 'D', email: 'd@example.com', message: 'm' },
      });
      const { dispatcher, provider } = dispatcherWith();
      provider.failNext(new EmailSendError('resend_422_validation_error', false));
      await dispatcher.runOnce();
      const [event] = await rows<{ id: string }>('select id from notification_events');
      return event!.id;
    }

    it('lists failed notifications with sanitized errors and their deliveries (ADMIN only)', async () => {
      const id = await deadLetter();

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/notifications?status=FAILED',
        headers: await as('admin'),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        data: [
          {
            id,
            eventType: 'CONTACT_RECEIVED',
            status: 'FAILED',
            lastError: 'resend_422_validation_error',
            deliveries: [
              {
                template: 'staff.contact_received',
                status: 'FAILED',
                recipient: 'team@example.com',
              },
            ],
          },
        ],
        pagination: { total: 1 },
      });

      const reviewer = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/notifications',
        headers: await as('reviewer'),
      });
      expect(reviewer.statusCode).toBe(403);
    });

    it('requeues a failed notification (audited), which then goes out', async () => {
      const id = await deadLetter();

      const retry = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/notifications/${id}/retry`,
        headers: await as('admin'),
      });
      expect(retry.statusCode).toBe(200);
      expect(retry.json()).toEqual({ data: { id, status: 'PENDING' } });
      expect(await rows('select status, attempts from notification_events')).toEqual([
        { status: 'PENDING', attempts: 0 },
      ]);
      expect(
        await rows(`select action, entity_type from audit_logs where entity_id = $1`, [id]),
      ).toEqual([{ action: 'notification.requeued', entity_type: 'notification_event' }]);

      const again = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/notifications/${id}/retry`,
        headers: await as('admin'),
      });
      expect(again.statusCode).toBe(409);

      const { dispatcher, provider } = dispatcherWith();
      await dispatcher.runOnce();
      expect(provider.sent).toHaveLength(1);
      expect(await rows('select status from notification_deliveries')).toEqual([
        { status: 'SENT' },
      ]);
    });

    it('404s an unknown notification and 403s reviewers', async () => {
      const unknown = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/notifications/00000000-0000-4000-8000-000000000999/retry',
        headers: await as('admin'),
      });
      expect(unknown.statusCode).toBe(404);
      const reviewer = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/notifications/00000000-0000-4000-8000-000000000999/retry',
        headers: await as('reviewer'),
      });
      expect(reviewer.statusCode).toBe(403);
    });
  });

  it('falls back to active ADMIN staff when no recipients are configured', async () => {
    await submitApplication('fallback@example.com');
    const { dispatcher, provider } = dispatcherWith({ staffRecipients: [] });
    await dispatcher.runOnce();
    // boss@example.com is the only ADMIN; the reviewer is not notified.
    expect(provider.sent.map((m) => m.to[0])).toEqual(['boss@example.com']);
  });

  it('skips notifications whose subject was deleted (retention request)', async () => {
    await submitApplication('gone@example.com');
    await admin.query(`delete from leads where email = 'gone@example.com'`);
    const { dispatcher, provider } = dispatcherWith();

    expect(await dispatcher.runOnce()).toMatchObject({ processed: 1 });
    expect(provider.sent).toEqual([]);
  });
  describe('serverless delivery (after-response trigger and scheduled sweep)', () => {
    const CRON_SECRET = 'cron-secret-for-tests-0123456789';
    let serverless: App;
    let provider: ReturnType<typeof createFakeEmailProvider>;

    beforeAll(async () => {
      provider = createFakeEmailProvider();
      serverless = await buildApp({
        config: testConfig({
          CONTACT_RATE_LIMIT_MAX: '1000',
          RATE_LIMIT_MAX: '10000',
          STAFF_NOTIFICATION_EMAILS: 'team@example.com',
          CRON_SECRET,
        }),
        database: createTestDatabase(2),
        emailProvider: provider,
        dispatchNotificationsAfterResponse: true,
      });
    });

    afterAll(async () => {
      await serverless.close();
    });

    it('sends the email right after the request that queued it', async () => {
      const response = await serverless.inject({
        method: 'POST',
        url: '/api/v1/contact',
        payload: { name: 'Fast Lane', email: 'fast@example.com', message: 'No polling here' },
      });
      expect(response.statusCode).toBeLessThan(400);

      await expect
        .poll(async () => rows<{ status: string }>(`select status from notification_events`))
        .toEqual([{ status: 'PROCESSED' }]);
      expect(provider.sent.map((m) => m.to)).toContainEqual(['team@example.com']);
    });

    it('does not dispatch after requests that cannot queue an email', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/contact',
        payload: { name: 'Queued', email: 'queued@example.com', message: 'Waiting' },
      });
      const before = provider.sent.length;
      await serverless.inject({ method: 'GET', url: '/api/v1/content/home' });
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(provider.sent).toHaveLength(before);
      expect(await rows(`select 1 from notification_events where status = 'PENDING'`)).toHaveLength(
        1,
      );
    });

    it('hides the scheduled sweep without the cron secret, and runs it with', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/contact',
        payload: { name: 'Swept', email: 'swept@example.com', message: 'Found by the sweep' },
      });
      const url = '/api/v1/internal/notifications/dispatch';

      expect((await serverless.inject({ method: 'GET', url })).statusCode).toBe(404);
      const wrong = await serverless.inject({
        method: 'GET',
        url,
        headers: { authorization: 'Bearer not-the-secret-at-all-000' },
      });
      expect(wrong.statusCode).toBe(404);

      const ok = await serverless.inject({
        method: 'GET',
        url,
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json()).toMatchObject({ data: { claimed: 1, processed: 1 } });
      expect(ok.headers['cache-control']).toBe('no-store');
    });
  });
});
