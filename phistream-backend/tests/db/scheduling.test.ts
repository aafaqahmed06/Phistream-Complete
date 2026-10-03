/**
 * Scheduling against real PostgreSQL (TEST_DATABASE_URL), end to end over
 * HTTP: eligibility, token issuance/resolution, signed provider webhooks
 * (mock and Cal.com adapters), idempotency, and meeting/application state.
 */
import { createHmac } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp, type App } from '../../src/app.js';
import type { Database } from '../../src/db/client.js';
import { createApplicationLifecycle } from '../../src/modules/applications/application-lifecycle.js';
import { publishApplicationForm } from '../../src/modules/applications/application-forms.repository.js';
import { createApplicationReviewService } from '../../src/modules/applications/application-review.service.js';
import { createApplicationsRepository } from '../../src/modules/applications/applications.repository.js';
import { createStaffAdministration } from '../../src/modules/admin/staff.repository.js';
import {
  CALCOM_SIGNATURE_HEADER,
  createCalcomProvider,
} from '../../src/providers/scheduling/calcom.js';
import {
  createMockSchedulingProvider,
  signMockWebhook,
} from '../../src/providers/scheduling/mock.js';
import { hashAccessToken } from '../../src/shared/security/access-tokens.js';
import { TEST_ANSWERS, TEST_FORM } from '../helpers/fake-applications.js';
import { createTestStaffAuth } from '../helpers/staff-auth.js';
import { createLogCollector, testConfig } from '../helpers/test-app.js';
import {
  connectAdmin,
  createTestDatabase,
  resetAndMigrate,
  TEST_DATABASE_URL,
} from '../helpers/test-database.js';

const MOCK_SECRET = 'mock-scheduling-secret-for-tests';
const CALCOM_SECRET = 'calcom-scheduling-secret-for-tests';
const PAGE_URL = 'https://phistream.example/schedule';

interface Issued {
  data: { token: string; expiresAt: string; link: string | null };
}

describe.skipIf(!TEST_DATABASE_URL)('scheduling (PostgreSQL)', () => {
  let admin: pg.Client;
  let database: Database;
  let app: App;
  let auth: Awaited<ReturnType<typeof createTestStaffAuth>>;
  let staffId: string;
  const mock = createMockSchedulingProvider({ webhookSecret: MOCK_SECRET });
  const logs = createLogCollector();

  beforeAll(async () => {
    admin = await connectAdmin();
    await resetAndMigrate(admin);
    auth = await createTestStaffAuth();
    database = createTestDatabase(6);
    app = await buildApp({
      config: testConfig({
        APPLICATION_RATE_LIMIT_MAX: '1000',
        RATE_LIMIT_MAX: '10000',
        SCHEDULING_PAGE_URL: PAGE_URL,
        LOG_LEVEL: 'info',
      }),
      database,
      staffTokenVerifier: auth.verifier,
      schedulingProvider: mock,
      logStream: logs.stream,
    });
    staffId = (
      await createStaffAdministration(database.db).add({
        authProviderId: 'sub-reviewer',
        email: 'reviewer@example.com',
        displayName: 'Rae',
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

  const rows = async <T extends pg.QueryResultRow>(text: string, values: unknown[] = []) =>
    (await admin.query<T>(text, values)).rows;

  const staffHeader = async () => ({
    authorization: `Bearer ${await auth.tokenFor('sub-reviewer')}`,
  });

  async function applicationIn(
    status: 'NEW' | 'UNDER_REVIEW' | 'REJECTED' | 'SCHEDULING_OPEN',
    email = 'jane@example.com',
  ) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/applications',
      payload: {
        formVersion: 'v1',
        name: 'Jane Doe',
        email,
        answers: { ...TEST_ANSWERS, about: `${status}-${email}-${Math.random()}` },
      },
    });
    const id = response.json<{ data: { application: { id: string } } }>().data.application.id;
    const review = createApplicationReviewService({
      repository: createApplicationsRepository(database.db),
    });
    const actor = { staffId };
    if (status !== 'NEW') await review.startReview(id, actor);
    if (status === 'REJECTED') await review.reject(id, actor);
    if (status === 'SCHEDULING_OPEN') await review.accept(id, actor);
    return id;
  }

  const issue = async (applicationId: string) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/admin/applications/${applicationId}/scheduling-access`,
      headers: await staffHeader(),
    });

  const resolve = (token?: string) =>
    app.inject({
      method: 'GET',
      url: '/api/v1/scheduling/session',
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    });

  /** Issues access and follows the applicant's path to the provider booking reference. */
  async function openScheduling(applicationId: string) {
    const { token } = (await issue(applicationId)).json<Issued>().data;
    const url = new URL(
      (await resolve(token)).json<{ data: { schedulingUrl: string } }>().data.schedulingUrl,
    );
    return { token, bookingRef: url.searchParams.get('ref') ?? '' };
  }

  const postMock = (body: object) => {
    const raw = JSON.stringify(body);
    return app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/scheduling/mock',
      headers: signMockWebhook(MOCK_SECRET, raw),
      payload: raw,
    });
  };

  const booking = (id: string, start = '2026-07-01T15:00:00Z', end = '2026-07-01T15:30:00Z') => ({
    id,
    startsAt: start,
    endsAt: end,
    meetingUrl: 'https://meet.example.com/abc',
  });

  const appStatus = async (id: string) =>
    (await rows<{ status: string }>('select status from applications where id = $1', [id]))[0]
      ?.status;

  describe('eligibility and access tokens', () => {
    it.each(['NEW', 'UNDER_REVIEW', 'REJECTED'] as const)(
      'refuses scheduling access for a %s application',
      async (status) => {
        const id = await applicationIn(status);
        const response = await issue(id);

        expect(response.statusCode).toBe(409);
        expect(
          await rows('select 1 from scheduling_sessions where application_id = $1', [id]),
        ).toEqual([]);
      },
    );

    it('issues a short-lived token for an accepted application, storing only hashes', async () => {
      const id = await applicationIn('SCHEDULING_OPEN');
      const response = await issue(id);

      expect(response.statusCode).toBe(201);
      expect(response.headers['cache-control']).toBe('no-store');
      const { token, expiresAt, link } = response.json<Issued>().data;
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(link).toBe(`${PAGE_URL}#token=${token}`);
      const hoursValid = (new Date(expiresAt).getTime() - Date.now()) / 3_600_000;
      expect(hoursValid).toBeGreaterThan(71);
      expect(hoursValid).toBeLessThanOrEqual(72);

      const [session] = await rows<{
        token_hash: string;
        booking_ref_hash: string;
        provider: string;
      }>(
        'select token_hash, booking_ref_hash, provider from scheduling_sessions where application_id = $1',
        [id],
      );
      expect(session).toMatchObject({ token_hash: hashAccessToken(token), provider: 'mock' });
      expect(session?.booking_ref_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(await rows('select * from scheduling_sessions'))).not.toContain(token);

      expect(
        await rows(
          `select actor_id, metadata->>'reissued' as reissued from audit_logs where action = 'application.scheduling_access_issued' and entity_id = $1`,
          [id],
        ),
      ).toEqual([{ actor_id: staffId, reissued: 'false' }]);
    });

    it('lets the token holder open the booking page, and nobody else', async () => {
      const id = await applicationIn('SCHEDULING_OPEN');
      const { token } = (await issue(id)).json<Issued>().data;

      const ok = await resolve(token);
      expect(ok.statusCode).toBe(200);
      expect(ok.headers['cache-control']).toBe('no-store');
      const data = ok.json<{ data: { eligible: boolean; schedulingUrl: string } }>().data;
      expect(data.eligible).toBe(true);
      expect(new URL(data.schedulingUrl).searchParams.get('ref')).toMatch(/^[A-Za-z0-9_-]{43}$/);
      // The booking reference is derived from, but is not, the token.
      expect(data.schedulingUrl).not.toContain(token);

      expect((await resolve()).statusCode).toBe(401);
      expect((await resolve()).headers['www-authenticate']).toBe('Bearer');
      expect((await resolve('A'.repeat(43))).statusCode).toBe(404);
      const inQuery = await app.inject(`/api/v1/scheduling/session?token=${token}`);
      expect(inQuery.statusCode).toBe(401);
    });

    it('expires tokens', async () => {
      const id = await applicationIn('SCHEDULING_OPEN');
      const { token } = (await issue(id)).json<Issued>().data;
      await admin.query(
        `update scheduling_sessions set expires_at = now() - interval '1 second' where application_id = $1`,
        [id],
      );

      expect((await resolve(token)).statusCode).toBe(404);
    });

    it('re-issuing invalidates the previous token and is audited as a re-issue', async () => {
      const id = await applicationIn('SCHEDULING_OPEN');
      const first = (await issue(id)).json<Issued>().data.token;
      const second = (await issue(id)).json<Issued>().data.token;

      expect((await resolve(first)).statusCode).toBe(404);
      expect((await resolve(second)).statusCode).toBe(200);
      expect(
        await rows('select count(*)::int as n from scheduling_sessions where application_id = $1', [
          id,
        ]),
      ).toEqual([{ n: 1 }]);
      expect(
        await rows(
          `select metadata->>'reissued' as r from audit_logs where action = 'application.scheduling_access_issued' and entity_id = $1 order by created_at`,
          [id],
        ),
      ).toEqual([{ r: 'false' }, { r: 'true' }]);
    });

    it('stops working once the application is no longer awaiting a booking', async () => {
      const id = await applicationIn('SCHEDULING_OPEN');
      const { token } = (await issue(id)).json<Issued>().data;
      await createApplicationLifecycle({
        repository: createApplicationsRepository(database.db),
      }).transition({
        applicationId: id,
        to: 'WITHDRAWN',
        actor: { type: 'APPLICANT' },
      });

      expect((await resolve(token)).statusCode).toBe(404);
    });
  });

  describe('webhooks: booking lifecycle', () => {
    it('BOOKING_CREATED links the booking, schedules the application, and consumes the token', async () => {
      const id = await applicationIn('SCHEDULING_OPEN');
      const { token, bookingRef } = await openScheduling(id);

      const response = await postMock({
        id: 'evt-1',
        type: 'BOOKING_CREATED',
        booking: booking('bk-1'),
        bookingRef,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ received: true });

      expect(await appStatus(id)).toBe('SCHEDULED');
      const meetings = await rows<{ id: string }>(
        `select id, provider, provider_event_id, status, starts_at, meeting_url from meetings where application_id = $1`,
        [id],
      );
      expect(meetings).toEqual([
        expect.objectContaining({
          provider: 'mock',
          provider_event_id: 'bk-1',
          status: 'SCHEDULED',
          starts_at: new Date('2026-07-01T15:00:00Z'),
          meeting_url: 'https://meet.example.com/abc',
        }),
      ]);
      expect(
        await rows(
          `select event_type, actor_type from application_events where application_id = $1 order by created_at`,
          [id],
        ),
      ).toEqual([
        { event_type: 'SUBMITTED', actor_type: 'APPLICANT' },
        { event_type: 'REVIEW_STARTED', actor_type: 'STAFF' },
        { event_type: 'ACCEPTED', actor_type: 'STAFF' },
        { event_type: 'SCHEDULING_ENABLED', actor_type: 'SYSTEM' },
        { event_type: 'BOOKING_CREATED', actor_type: 'PROVIDER' },
      ]);
      expect(
        await rows(
          `select event_type from notification_events where subject_type = 'meeting' and subject_id = $1`,
          [meetings[0]!.id],
        ),
      ).toEqual([{ event_type: 'MEETING_BOOKED' }]);
      expect(
        await rows(
          `select provider_event_id, event_type, outcome, booking_id, application_id from scheduling_webhook_events`,
        ),
      ).toEqual([
        {
          provider_event_id: 'evt-1',
          event_type: 'BOOKING_CREATED',
          outcome: 'PROCESSED',
          booking_id: 'bk-1',
          application_id: id,
        },
      ]);

      // Used: the link no longer opens the booking page.
      expect((await resolve(token)).statusCode).toBe(404);
    });

    it('is idempotent: redelivery and the same booking under a new event id change nothing', async () => {
      const id = await applicationIn('SCHEDULING_OPEN');
      const { bookingRef } = await openScheduling(id);
      const event = {
        id: 'evt-dup',
        type: 'BOOKING_CREATED',
        booking: booking('bk-dup'),
        bookingRef,
      };

      expect((await postMock(event)).statusCode).toBe(200);
      expect((await postMock(event)).statusCode).toBe(200);
      expect((await postMock({ ...event, id: 'evt-dup-2' })).statusCode).toBe(200);

      expect(await rows('select count(*)::int as n from meetings')).toEqual([{ n: 1 }]);
      expect(
        await rows(
          `select count(*)::int as n from application_events where event_type = 'BOOKING_CREATED'`,
        ),
      ).toEqual([{ n: 1 }]);
      expect(
        await rows(
          'select provider_event_id, outcome from scheduling_webhook_events order by received_at',
        ),
      ).toEqual([
        { provider_event_id: 'evt-dup', outcome: 'PROCESSED' },
        { provider_event_id: 'evt-dup-2', outcome: 'IGNORED' },
      ]);
    });

    it('BOOKING_RESCHEDULED replaces the meeting and keeps the application scheduled', async () => {
      const id = await applicationIn('SCHEDULING_OPEN');
      const { bookingRef } = await openScheduling(id);
      await postMock({
        id: 'evt-a',
        type: 'BOOKING_CREATED',
        booking: booking('bk-a'),
        bookingRef,
      });

      const response = await postMock({
        id: 'evt-b',
        type: 'BOOKING_RESCHEDULED',
        booking: booking('bk-b', '2026-07-02T10:00:00Z', '2026-07-02T10:30:00Z'),
        previousBookingId: 'bk-a',
        bookingRef,
      });
      expect(response.statusCode).toBe(200);

      expect(await appStatus(id)).toBe('SCHEDULED');
      expect(
        await rows(
          'select provider_event_id, status, starts_at from meetings where application_id = $1 order by created_at',
          [id],
        ),
      ).toEqual([
        {
          provider_event_id: 'bk-a',
          status: 'RESCHEDULED',
          starts_at: new Date('2026-07-01T15:00:00Z'),
        },
        {
          provider_event_id: 'bk-b',
          status: 'SCHEDULED',
          starts_at: new Date('2026-07-02T10:00:00Z'),
        },
      ]);
      expect(
        await rows(
          `select event_type, actor_type from application_events where application_id = $1 and event_type = 'BOOKING_RESCHEDULED'`,
          [id],
        ),
      ).toEqual([{ event_type: 'BOOKING_RESCHEDULED', actor_type: 'PROVIDER' }]);
      expect(
        await rows(
          `select count(*)::int as n from notification_events where event_type = 'MEETING_RESCHEDULED'`,
        ),
      ).toEqual([{ n: 1 }]);
    });

    it('BOOKING_CANCELLED reopens scheduling and makes the (unexpired) link usable again', async () => {
      const id = await applicationIn('SCHEDULING_OPEN');
      const { token, bookingRef } = await openScheduling(id);
      await postMock({
        id: 'evt-c1',
        type: 'BOOKING_CREATED',
        booking: booking('bk-c'),
        bookingRef,
      });
      expect((await resolve(token)).statusCode).toBe(404);

      expect(
        (await postMock({ id: 'evt-c2', type: 'BOOKING_CANCELLED', bookingId: 'bk-c' })).statusCode,
      ).toBe(200);

      expect(await appStatus(id)).toBe('SCHEDULING_OPEN');
      expect(await rows('select status from meetings where application_id = $1', [id])).toEqual([
        { status: 'CANCELLED' },
      ]);
      expect(
        await rows(
          `select event_type, actor_type from application_events where application_id = $1 order by created_at desc limit 1`,
          [id],
        ),
      ).toEqual([{ event_type: 'BOOKING_CANCELLED', actor_type: 'PROVIDER' }]);
      expect((await resolve(token)).statusCode).toBe(200);

      // A second cancellation of the same booking is ignored.
      await postMock({ id: 'evt-c3', type: 'BOOKING_CANCELLED', bookingId: 'bk-c' });
      expect(
        await rows(
          `select outcome from scheduling_webhook_events where provider_event_id = 'evt-c3'`,
        ),
      ).toEqual([{ outcome: 'IGNORED' }]);

      // And the applicant can book again.
      await postMock({
        id: 'evt-c4',
        type: 'BOOKING_CREATED',
        booking: booking('bk-c-2'),
        bookingRef,
      });
      expect(await appStatus(id)).toBe('SCHEDULED');
    });

    it('public status follows the booking', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/applications',
        payload: {
          formVersion: 'v1',
          name: 'Pat',
          email: 'pat@example.com',
          answers: TEST_ANSWERS,
        },
      });
      const created = response.json<{
        data: { application: { id: string }; statusAccess: { token: string } };
      }>().data;
      const review = createApplicationReviewService({
        repository: createApplicationsRepository(database.db),
      });
      await review.startReview(created.application.id, { staffId });
      await review.accept(created.application.id, { staffId });
      const { bookingRef } = await openScheduling(created.application.id);
      await postMock({
        id: 'evt-status',
        type: 'BOOKING_CREATED',
        booking: booking('bk-status'),
        bookingRef,
      });

      const status = await app.inject({
        method: 'GET',
        url: `/api/v1/applications/${created.application.id}/status`,
        headers: { authorization: `Bearer ${created.statusAccess.token}` },
      });
      expect(status.json<{ data: { status: string } }>().data.status).toBe('MEETING_SCHEDULED');
    });
  });

  describe('webhooks: untrusted and unmatched input', () => {
    it('rejects bad signatures and records nothing', async () => {
      const id = await applicationIn('SCHEDULING_OPEN');
      const { bookingRef } = await openScheduling(id);
      const raw = JSON.stringify({
        id: 'evt-forged',
        type: 'BOOKING_CREATED',
        booking: booking('bk-forged'),
        bookingRef,
      });

      for (const headers of [
        { 'content-type': 'application/json' },
        signMockWebhook('wrong-secret-value-000000', raw),
        signMockWebhook(MOCK_SECRET, `${raw} `), // signed different bytes
      ]) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/webhooks/scheduling/mock',
          headers,
          payload: raw,
        });
        expect(response.statusCode).toBe(401);
      }
      expect(await rows('select count(*)::int as n from scheduling_webhook_events')).toEqual([
        { n: 0 },
      ]);
      expect(await appStatus(id)).toBe('SCHEDULING_OPEN');
    });

    it('404s webhooks for a provider that is not configured', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/scheduling/calcom',
        headers: { 'content-type': 'application/json' },
        payload: '{}',
      });
      expect(response.statusCode).toBe(404);
    });

    it.each([
      ['no booking reference', undefined],
      ['an unknown booking reference', 'A'.repeat(43)],
    ])('does not link a booking with %s, and flags it for staff', async (_, bookingRef) => {
      const id = await applicationIn('SCHEDULING_OPEN');
      const response = await postMock({
        id: `evt-unmatched-${String(bookingRef)}`,
        type: 'BOOKING_CREATED',
        booking: booking('bk-stranger'),
        bookingRef,
      });

      expect(response.statusCode).toBe(200);
      expect(await rows('select count(*)::int as n from meetings')).toEqual([{ n: 0 }]);
      expect(await appStatus(id)).toBe('SCHEDULING_OPEN');
      const [event] = await rows<{ id: string; outcome: string }>(
        'select id, outcome from scheduling_webhook_events',
      );
      expect(event?.outcome).toBe('UNMATCHED');
      expect(
        await rows(
          `select event_type from notification_events where subject_type = 'scheduling_webhook_event' and subject_id = $1`,
          [event?.id],
        ),
      ).toEqual([{ event_type: 'SCHEDULING_BOOKING_NEEDS_ATTENTION' }]);
    });

    it('does not let a withdrawn application book, even with a valid reference', async () => {
      const id = await applicationIn('SCHEDULING_OPEN');
      const { bookingRef } = await openScheduling(id);
      await createApplicationLifecycle({
        repository: createApplicationsRepository(database.db),
      }).transition({
        applicationId: id,
        to: 'WITHDRAWN',
        actor: { type: 'APPLICANT' },
      });

      await postMock({
        id: 'evt-late',
        type: 'BOOKING_CREATED',
        booking: booking('bk-late'),
        bookingRef,
      });

      expect(await appStatus(id)).toBe('WITHDRAWN');
      expect(await rows('select count(*)::int as n from meetings')).toEqual([{ n: 0 }]);
      expect(await rows('select outcome from scheduling_webhook_events')).toEqual([
        { outcome: 'NOT_ELIGIBLE' },
      ]);
      expect(
        await rows(
          `select count(*)::int as n from notification_events where event_type = 'SCHEDULING_BOOKING_NEEDS_ATTENTION'`,
        ),
      ).toEqual([{ n: 1 }]);
    });

    it('a booking reference from a replaced token no longer links', async () => {
      const id = await applicationIn('SCHEDULING_OPEN');
      const { bookingRef: oldRef } = await openScheduling(id);
      await issue(id); // re-issue: new token, new reference

      await postMock({
        id: 'evt-stale',
        type: 'BOOKING_CREATED',
        booking: booking('bk-stale'),
        bookingRef: oldRef,
      });
      expect(await rows('select outcome from scheduling_webhook_events')).toEqual([
        { outcome: 'UNMATCHED' },
      ]);
      expect(await appStatus(id)).toBe('SCHEDULING_OPEN');
    });

    it('ignores cancellations of bookings it never linked', async () => {
      await postMock({
        id: 'evt-foreign-cancel',
        type: 'BOOKING_CANCELLED',
        bookingId: 'somebody-else',
      });
      expect(await rows('select outcome from scheduling_webhook_events')).toEqual([
        { outcome: 'UNMATCHED' },
      ]);
      expect(await rows(`select count(*)::int as n from notification_events`)).toEqual([{ n: 0 }]);
    });

    it('rolls back on failure, so the provider retry is processed', async () => {
      const id = await applicationIn('SCHEDULING_OPEN');
      const { bookingRef } = await openScheduling(id);
      const event = {
        id: 'evt-retry',
        type: 'BOOKING_CREATED',
        booking: booking('bk-retry'),
        bookingRef,
      };

      await admin.query(
        `alter table notification_events add constraint test_block check (false) not valid`,
      );
      try {
        expect((await postMock(event)).statusCode).toBe(500);
      } finally {
        await admin.query('alter table notification_events drop constraint test_block');
      }
      expect(await rows('select count(*)::int as n from scheduling_webhook_events')).toEqual([
        { n: 0 },
      ]);
      expect(await rows('select count(*)::int as n from meetings')).toEqual([{ n: 0 }]);
      expect(await appStatus(id)).toBe('SCHEDULING_OPEN');

      expect((await postMock(event)).statusCode).toBe(200);
      expect(await appStatus(id)).toBe('SCHEDULED');
    });

    it('accepts verified event types it does not act on', async () => {
      expect((await postMock({ id: 'evt-ping', type: 'PING' })).statusCode).toBe(200);
      expect(await rows('select outcome from scheduling_webhook_events')).toEqual([
        { outcome: 'IGNORED' },
      ]);
    });
  });

  describe('booking lookup (admin)', () => {
    it("returns the meeting and the provider's live view", async () => {
      const id = await applicationIn('SCHEDULING_OPEN');
      const { bookingRef } = await openScheduling(id);
      await postMock({
        id: 'evt-lookup',
        type: 'BOOKING_CREATED',
        booking: booking('bk-lookup'),
        bookingRef,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/applications/${id}/booking`,
        headers: await staffHeader(),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        data: {
          meeting: { status: 'SCHEDULED', startsAt: '2026-07-01T15:00:00.000Z' },
          providerBooking: { id: 'bk-lookup', status: 'SCHEDULED' },
        },
      });
    });

    it('404s when there is no booking', async () => {
      const id = await applicationIn('SCHEDULING_OPEN');
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/applications/${id}/booking`,
        headers: await staffHeader(),
      });
      expect(response.statusCode).toBe(404);
    });

    it('shows the scheduling session in the application detail without hashes', async () => {
      const id = await applicationIn('SCHEDULING_OPEN');
      await openScheduling(id);
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/applications/${id}`,
        headers: await staffHeader(),
      });
      const detail = response.json<{
        data: { scheduling: { session: Record<string, unknown> }; availableActions: string[] };
      }>().data;

      expect(detail.scheduling.session).toMatchObject({ provider: 'mock', usedAt: null });
      expect(detail.availableActions).toContain('schedule');
      const [session] = await rows<{ token_hash: string; booking_ref_hash: string }>(
        'select token_hash, booking_ref_hash from scheduling_sessions where application_id = $1',
        [id],
      );
      expect(response.body).not.toContain(session!.token_hash);
      expect(response.body).not.toContain(session!.booking_ref_hash);
    });
  });

  describe('logging', () => {
    it('never logs tokens, booking references, or attendee data', async () => {
      const id = await applicationIn('SCHEDULING_OPEN', 'logcheck@example.com');
      const { token, bookingRef } = await openScheduling(id);
      await postMock({
        id: 'evt-log',
        type: 'BOOKING_CREATED',
        booking: booking('bk-log'),
        bookingRef,
      });

      expect(logs.text).toContain('scheduling webhook handled');
      for (const secret of [token, bookingRef, 'logcheck@example.com', MOCK_SECRET]) {
        expect(logs.text).not.toContain(secret);
      }
    });
  });

  describe('Cal.com adapter end to end', () => {
    let calApp: App;

    beforeAll(async () => {
      calApp = await buildApp({
        config: testConfig({ RATE_LIMIT_MAX: '10000' }),
        database: createTestDatabase(2),
        staffTokenVerifier: auth.verifier,
        schedulingProvider: createCalcomProvider({
          bookingUrl: 'https://cal.com/phistream-demo/intro',
          webhookSecret: CALCOM_SECRET,
          apiKey: undefined,
          apiBaseUrl: 'https://api.cal.com/v2',
          apiVersion: '2024-08-13',
        }),
      });
    });

    afterAll(async () => {
      await calApp.close();
    });

    const postCal = (body: object, secret = CALCOM_SECRET) => {
      const raw = JSON.stringify(body);
      return calApp.inject({
        method: 'POST',
        url: '/api/v1/webhooks/scheduling/calcom',
        headers: {
          'content-type': 'application/json',
          [CALCOM_SIGNATURE_HEADER]: createHmac('sha256', secret).update(raw).digest('hex'),
        },
        payload: raw,
      });
    };

    it('books, reschedules, and cancels through Cal.com-shaped webhooks', async () => {
      const id = await applicationIn('SCHEDULING_OPEN', 'cal@example.com');
      const issued = await calApp.inject({
        method: 'POST',
        url: `/api/v1/admin/applications/${id}/scheduling-access`,
        headers: await staffHeader(),
      });
      const { token } = issued.json<Issued>().data;
      const session = await calApp.inject({
        method: 'GET',
        url: '/api/v1/scheduling/session',
        headers: { authorization: `Bearer ${token}` },
      });
      const schedulingUrl = new URL(
        session.json<{ data: { schedulingUrl: string } }>().data.schedulingUrl,
      );
      expect(schedulingUrl.hostname).toBe('cal.com');
      expect(schedulingUrl.searchParams.get('email')).toBe('cal@example.com');
      const ref = schedulingUrl.searchParams.get('metadata[phistreamRef]');

      const payload = (uid: string, extra: object = {}) => ({
        uid,
        startTime: '2026-08-01T09:00:00Z',
        endTime: '2026-08-01T09:30:00Z',
        attendees: [{ email: 'cal@example.com' }],
        metadata: { phistreamRef: ref, videoCallUrl: 'https://cal.video/abc' },
        ...extra,
      });

      expect(
        (await postCal({ triggerEvent: 'BOOKING_CREATED', payload: payload('cal-1') })).statusCode,
      ).toBe(200);
      expect(await appStatus(id)).toBe('SCHEDULED');

      // Identical redelivery (same bytes → same derived event id) is a no-op.
      expect(
        (await postCal({ triggerEvent: 'BOOKING_CREATED', payload: payload('cal-1') })).statusCode,
      ).toBe(200);
      expect(
        await rows(
          `select count(*)::int as n from scheduling_webhook_events where provider = 'calcom'`,
        ),
      ).toEqual([{ n: 1 }]);

      await postCal({
        triggerEvent: 'BOOKING_RESCHEDULED',
        payload: payload('cal-2', {
          rescheduleUid: 'cal-1',
          startTime: '2026-08-02T09:00:00Z',
          endTime: '2026-08-02T09:30:00Z',
        }),
      });
      expect(
        await rows(
          `select provider_event_id, status, meeting_url from meetings where application_id = $1 order by created_at`,
          [id],
        ),
      ).toEqual([
        { provider_event_id: 'cal-1', status: 'RESCHEDULED', meeting_url: 'https://cal.video/abc' },
        { provider_event_id: 'cal-2', status: 'SCHEDULED', meeting_url: 'https://cal.video/abc' },
      ]);

      await postCal({ triggerEvent: 'BOOKING_CANCELLED', payload: { uid: 'cal-2' } });
      expect(await appStatus(id)).toBe('SCHEDULING_OPEN');

      // Forged Cal.com webhook.
      expect(
        (
          await postCal(
            { triggerEvent: 'BOOKING_CREATED', payload: payload('cal-x') },
            'forged-secret-value-123',
          )
        ).statusCode,
      ).toBe(401);
    });

    it('answers 503 for booking lookup without a Cal.com API key', async () => {
      const id = await applicationIn('SCHEDULING_OPEN', 'cal2@example.com');
      await admin.query(
        `insert into meetings (application_id, provider, provider_event_id, starts_at, ends_at)
         values ($1, 'calcom', 'cal-lookup', now(), now() + interval '30 minutes')`,
        [id],
      );
      const response = await calApp.inject({
        method: 'GET',
        url: `/api/v1/admin/applications/${id}/booking`,
        headers: await staffHeader(),
      });
      expect(response.statusCode).toBe(503);
    });
  });
});
