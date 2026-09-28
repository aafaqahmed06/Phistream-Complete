/**
 * Funnel analytics against real PostgreSQL (TEST_DATABASE_URL): ingestion
 * through the public route, the aggregation SQL (distinct sessions, periods,
 * filters, application cohorts), and the guarantee that business outcomes
 * come only from authoritative tables.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp, type App } from '../../src/app.js';
import type { Database } from '../../src/db/client.js';
import { createStaffAdministration } from '../../src/modules/admin/staff.repository.js';
import { publishApplicationForm } from '../../src/modules/applications/application-forms.repository.js';
import { createApplicationReviewService } from '../../src/modules/applications/application-review.service.js';
import { createApplicationsRepository } from '../../src/modules/applications/applications.repository.js';
import { TEST_ANSWERS, TEST_FORM } from '../helpers/fake-applications.js';
import { createTestStaffAuth } from '../helpers/staff-auth.js';
import { testConfig } from '../helpers/test-app.js';
import {
  connectAdmin,
  createTestDatabase,
  resetAndMigrate,
  TEST_DATABASE_URL,
} from '../helpers/test-database.js';

interface Funnel {
  data: {
    period: { from: string; to: string };
    funnel: Record<string, number>;
    conversion: Record<string, number | null>;
    vslProgress: Record<string, number>;
    clientReported: Record<string, number>;
    bySource: {
      source: string | null;
      onboardingViews: number;
      applications: number;
      accepted: number;
      meetingsBooked: number;
    }[];
  };
}

describe.skipIf(!TEST_DATABASE_URL)('analytics (PostgreSQL)', () => {
  let admin: pg.Client;
  let database: Database;
  let app: App;
  let auth: Awaited<ReturnType<typeof createTestStaffAuth>>;
  let staffId: string;

  beforeAll(async () => {
    admin = await connectAdmin();
    await resetAndMigrate(admin);
    auth = await createTestStaffAuth();
    database = createTestDatabase(4);
    app = await buildApp({
      config: testConfig({
        ANALYTICS_RATE_LIMIT_MAX: '10000',
        APPLICATION_RATE_LIMIT_MAX: '1000',
        RATE_LIMIT_MAX: '10000',
      }),
      database,
      staffTokenVerifier: auth.verifier,
    });
    const staff = createStaffAdministration(database.db);
    staffId = (
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
    await admin.query('truncate analytics_events, leads, notification_events cascade');
  });

  const track = (event: string, session: string, extra: Record<string, unknown> = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/analytics/events',
      payload: { event, anonymousSessionId: session, ...extra },
    });

  const funnel = async (query = '', who: 'admin' | 'reviewer' = 'admin') =>
    app.inject({
      method: 'GET',
      url: `/api/v1/admin/analytics/funnel${query}`,
      headers: { authorization: `Bearer ${await auth.tokenFor(`sub-${who}`)}` },
    });

  let applyCount = 0;
  async function apply(email: string, source?: string, campaign?: string) {
    applyCount += 1;
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/applications',
      payload: {
        formVersion: 'v1',
        name: 'Applicant',
        email,
        source,
        campaign,
        // Distinct answers: identical resubmissions are (correctly) rejected as duplicates.
        answers: { ...TEST_ANSWERS, about: `${email} #${applyCount}` },
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ data: { application: { id: string } } }>().data.application.id;
  }

  const review = () =>
    createApplicationReviewService({ repository: createApplicationsRepository(database.db) });

  it('stores ingested events minimally (no IP, user agent, or metadata)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/analytics/events',
      headers: { 'user-agent': 'Mozilla/5.0 (Private)', 'x-forwarded-for': '198.51.100.7' },
      payload: {
        event: 'onboarding_view',
        anonymousSessionId: 'sess_minimal_1',
        source: 'instagram',
        path: '/onboarding?email=jane@example.com',
        referrer: 'https://l.instagram.com/some/path?x=1',
      },
    });
    expect(response.statusCode).toBe(202);

    const [row] = (await admin.query('select * from analytics_events')).rows;
    expect(row).toMatchObject({
      event_name: 'onboarding_view',
      anonymous_session_id: 'sess_minimal_1',
      source: 'instagram',
      campaign: null,
      path: '/onboarding',
      referrer: 'https://l.instagram.com',
      application_id: null,
      metadata: null,
    });
    const stored = JSON.stringify(row);
    for (const value of ['Mozilla', '198.51.100.7', '127.0.0.1', 'jane@example.com'])
      expect(stored).not.toContain(value);
  });

  it('refuses privileged events even though the database column would allow them', async () => {
    for (const event of ['application_accepted', 'application_rejected', 'meeting_booked']) {
      expect((await track(event, 'sess_forger_1')).statusCode).toBe(400);
    }
    expect((await admin.query('select count(*)::int as n from analytics_events')).rows).toEqual([
      { n: 0 },
    ]);
  });

  it('counts distinct sessions per stage, not raw events', async () => {
    // Session A: views twice, starts and finishes the VSL, starts an application.
    for (const event of [
      'onboarding_view',
      'onboarding_view',
      'vsl_start',
      'vsl_25',
      'vsl_50',
      'vsl_75',
      'vsl_complete',
      'application_start',
    ]) {
      await track(event, 'sess_aaaaaaaa');
    }
    // Session B: views, starts the VSL, reaches 25 %.
    for (const event of ['onboarding_view', 'vsl_start', 'vsl_start', 'vsl_25'])
      await track(event, 'sess_bbbbbbbb');
    // Session C: views only. Session D: scheduling page.
    await track('onboarding_view', 'sess_cccccccc');
    await track('scheduling_opened', 'sess_dddddddd');
    await track('application_submit', 'sess_aaaaaaaa');

    const { data } = (await funnel()).json<Funnel>();
    expect(data.funnel).toMatchObject({
      onboardingViews: 3,
      vslStarts: 2,
      vslCompletes: 1,
      applicationStarts: 1,
    });
    expect(data.vslProgress).toEqual({
      started: 2,
      reached25: 2,
      reached50: 1,
      reached75: 1,
      completed: 1,
    });
    expect(data.clientReported).toEqual({ applicationSubmits: 1, schedulingOpened: 1 });
    expect(data.conversion.vslStartRate).toBe(0.6667);
  });

  it('respects the period: from is inclusive, to is exclusive', async () => {
    await track('onboarding_view', 'sess_in_period');
    await track('onboarding_view', 'sess_at_to');
    await track('onboarding_view', 'sess_before');
    await admin.query(
      `update analytics_events set created_at = '2026-03-01T00:00:00Z' where anonymous_session_id = 'sess_in_period'`,
    );
    await admin.query(
      `update analytics_events set created_at = '2026-04-01T00:00:00Z' where anonymous_session_id = 'sess_at_to'`,
    );
    await admin.query(
      `update analytics_events set created_at = '2026-02-28T23:59:59Z' where anonymous_session_id = 'sess_before'`,
    );

    const { data } = (
      await funnel('?from=2026-03-01T00:00:00Z&to=2026-04-01T00:00:00Z')
    ).json<Funnel>();
    expect(data.funnel.onboardingViews).toBe(1);
    expect(data.period).toEqual({
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-04-01T00:00:00.000Z',
    });
  });

  it('measures applications, acceptances, rejections and bookings from authoritative records only', async () => {
    const accepted = await apply('a@example.com', 'instagram', 'bio');
    const rejected = await apply('r@example.com', 'instagram', 'bio');
    const booked = await apply('b@example.com', 'tiktok');
    await apply('pending@example.com');

    for (const id of [accepted, rejected, booked]) await review().startReview(id, { staffId });
    await review().accept(accepted, { staffId });
    await review().reject(rejected, { staffId });
    await review().accept(booked, { staffId });
    await admin.query(
      `insert into meetings (application_id, provider, provider_event_id, starts_at, ends_at, status)
       values ($1, 'mock', 'bk-1', now(), now() + interval '30 minutes', 'CANCELLED')`,
      [booked],
    );
    // A forged "business outcome" smuggled straight into analytics_events is ignored.
    await admin.query(
      `insert into analytics_events (event_name, anonymous_session_id) values
         ('application_accepted', 'sess_forged_1'), ('meeting_booked', 'sess_forged_1')`,
    );
    for (const s of [
      'sess_v1aaaaaa',
      'sess_v2aaaaaa',
      'sess_v3aaaaaa',
      'sess_v4aaaaaa',
      'sess_v5aaaaaa',
    ]) {
      await track('onboarding_view', s, { source: s === 'sess_v5aaaaaa' ? 'tiktok' : 'instagram' });
    }

    const { data } = (await funnel()).json<Funnel>();
    expect(data.funnel).toMatchObject({
      applications: 4,
      accepted: 2,
      rejected: 1,
      meetingsBooked: 1,
    });
    expect(data.conversion).toMatchObject({
      applicationRate: 0.8, // 4 / 5
      acceptanceRate: 0.6667, // 2 / (2 + 1)
      bookingRate: 0.5, // 1 / 2 (a cancelled booking still counts as booked)
      overallRate: 0.2,
    });

    expect(data.bySource).toEqual([
      expect.objectContaining({
        source: 'instagram',
        onboardingViews: 4,
        applications: 2,
        accepted: 1,
        meetingsBooked: 0,
      }),
      expect.objectContaining({
        source: 'tiktok',
        onboardingViews: 1,
        applications: 1,
        accepted: 1,
        meetingsBooked: 1,
      }),
      expect.objectContaining({ source: null, onboardingViews: 0, applications: 1, accepted: 0 }),
    ]);

    // Aggregates only: nothing identifying leaves the endpoint.
    const body = (await funnel()).body;
    for (const value of ['a@example.com', 'I make videos', accepted, 'sess_v1aaaaaa'])
      expect(body).not.toContain(value);
  });

  it('keeps an archived rejection counted as rejected', async () => {
    const id = await apply('arch@example.com');
    await review().startReview(id, { staffId });
    await review().reject(id, { staffId });
    await admin.query(`update applications set status = 'ARCHIVED' where id = $1`, [id]);

    expect((await funnel()).json<Funnel>().data.funnel).toMatchObject({
      applications: 1,
      rejected: 1,
      accepted: 0,
    });
  });

  it('filters both bases by source and campaign', async () => {
    await apply('i1@example.com', 'instagram', 'bio');
    await apply('i2@example.com', 'instagram', 'story');
    await apply('t1@example.com', 'tiktok', 'bio');
    await track('onboarding_view', 'sess_ib_aaaa', { source: 'instagram', campaign: 'bio' });
    await track('onboarding_view', 'sess_is_aaaa', { source: 'instagram', campaign: 'story' });
    await track('onboarding_view', 'sess_tb_aaaa', { source: 'tiktok', campaign: 'bio' });

    const instagram = (await funnel('?source=Instagram')).json<Funnel>().data;
    expect(instagram.funnel).toMatchObject({ onboardingViews: 2, applications: 2 });
    expect(instagram.bySource.map((r) => r.source)).toEqual(['instagram']);

    const bio = (await funnel('?campaign=bio')).json<Funnel>().data;
    expect(bio.funnel).toMatchObject({ onboardingViews: 2, applications: 2 });

    const both = (await funnel('?source=instagram&campaign=bio')).json<Funnel>().data;
    expect(both.funnel).toMatchObject({ onboardingViews: 1, applications: 1 });
  });

  it('attributes applications to the touch that produced them, not the lead’s first touch', async () => {
    await apply('same@example.com', 'instagram');
    await apply('same@example.com', 'tiktok'); // same lead, later campaign

    expect(
      (await admin.query(`select source from applications order by created_at`)).rows.map(
        (r: { source: string }) => r.source,
      ),
    ).toEqual(['instagram', 'tiktok']);
    expect((await admin.query(`select source from leads`)).rows).toEqual([{ source: 'instagram' }]);
    expect((await funnel('?source=tiktok')).json<Funnel>().data.funnel.applications).toBe(1);
  });

  it('is ADMIN-only and validates its query', async () => {
    expect((await funnel('', 'reviewer')).statusCode).toBe(403);
    expect((await app.inject('/api/v1/admin/analytics/funnel')).statusCode).toBe(401);
    for (const query of [
      '?from=2026-05-01',
      '?from=2026-05-02T00:00:00Z&to=2026-05-01T00:00:00Z',
      '?from=2024-01-01T00:00:00Z&to=2026-01-01T00:00:00Z',
      '?event=application_accepted',
    ]) {
      expect((await funnel(query)).statusCode, query).toBe(400);
    }
    expect((await funnel()).headers['cache-control']).toBe('no-store');
  });
});
