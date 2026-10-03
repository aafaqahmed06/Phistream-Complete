import { describe, expect, it, vi } from 'vitest';

import type {
  AnalyticsRepository,
  ClientStageCounts,
  CohortCounts,
  FunnelFilter,
} from '../../src/modules/analytics/analytics.repository.js';
import { createAnalyticsService, rate } from '../../src/modules/analytics/analytics.service.js';

const NOW = new Date('2026-07-01T00:00:00Z');

const client: ClientStageCounts = {
  onboardingViews: 1000,
  vslStarts: 720,
  vsl25: 600,
  vsl50: 450,
  vsl75: 300,
  vslCompletes: 250,
  applicationStarts: 240,
  applicationSubmits: 185,
  schedulingOpened: 55,
};
const cohort: CohortCounts = { applications: 180, accepted: 64, rejected: 96, meetingsBooked: 51 };

function repository(
  overrides: Partial<AnalyticsRepository> = {},
): AnalyticsRepository & { calls: FunnelFilter[] } {
  const calls: FunnelFilter[] = [];
  return {
    calls,
    currentTime: () => Promise.resolve(NOW),
    insertEvent: vi.fn(() => Promise.resolve()),
    clientStageCounts: (filter) => {
      calls.push(filter);
      return Promise.resolve(client);
    },
    applicationCohort: () => Promise.resolve(cohort),
    clientBySource: () =>
      Promise.resolve([
        { source: 'instagram', onboardingViews: 800, vslStarts: 600 },
        { source: null, onboardingViews: 150, vslStarts: 90 },
        { source: 'tiktok', onboardingViews: 50, vslStarts: 30 },
      ]),
    cohortBySource: () =>
      Promise.resolve([
        { source: 'instagram', applications: 150, accepted: 55, meetingsBooked: 45 },
        { source: 'referral', applications: 20, accepted: 6, meetingsBooked: 4 },
        { source: null, applications: 10, accepted: 3, meetingsBooked: 2 },
      ]),
    ...overrides,
  };
}

describe('rate', () => {
  it.each([
    [1, 3, 0.3333],
    [2, 3, 0.6667],
    [0, 5, 0],
    [5, 5, 1],
    [3, 0, null],
    [0, 0, null],
  ])('%i / %i = %s', (n, d, expected) => {
    expect(rate(n, d)).toBe(expected);
  });
});

describe('analytics service', () => {
  it('records exactly the minimized fields', async () => {
    const insertEvent = vi.fn(() => Promise.resolve());
    const repo = repository({ insertEvent });
    await createAnalyticsService({ repository: repo }).record({
      event: 'vsl_start',
      anonymousSessionId: 'sess_12345678',
      source: 'instagram',
      campaign: undefined,
      path: '/onboarding',
      referrer: undefined,
    });
    expect(insertEvent).toHaveBeenCalledWith({
      eventName: 'vsl_start',
      anonymousSessionId: 'sess_12345678',
      source: 'instagram',
      campaign: null,
      path: '/onboarding',
      referrer: null,
    });
  });

  it('combines client and authoritative stages and computes every ratio server-side', async () => {
    const report = await createAnalyticsService({
      repository: repository(),
    }).getFunnel({
      from: undefined,
      to: undefined,
      source: undefined,
      campaign: undefined,
    });

    expect(report.period).toEqual({ from: new Date('2026-06-01T00:00:00Z'), to: NOW });
    expect(report.funnel).toEqual({
      onboardingViews: 1000,
      vslStarts: 720,
      vslCompletes: 250,
      applicationStarts: 240,
      applications: 180,
      accepted: 64,
      rejected: 96,
      meetingsBooked: 51,
    });
    expect(report.conversion).toEqual({
      vslStartRate: 0.72,
      vslCompletionRate: 0.3472,
      applicationRate: 0.18,
      applicationCompletionRate: 0.75,
      acceptanceRate: 0.4, // 64 / (64 + 96): decided applications only
      bookingRate: 0.7969,
      overallRate: 0.051,
    });
    expect(report.vslProgress).toEqual({
      started: 720,
      reached25: 600,
      reached50: 450,
      reached75: 300,
      completed: 250,
    });
    // Client-reported submits are informational only.
    expect(report.clientReported).toEqual({ applicationSubmits: 185, schedulingOpened: 55 });
  });

  it('merges sources from both bases, busiest first', async () => {
    const report = await createAnalyticsService({
      repository: repository(),
    }).getFunnel({
      from: undefined,
      to: undefined,
      source: undefined,
      campaign: undefined,
    });
    expect(report.bySource).toEqual([
      {
        source: 'instagram',
        onboardingViews: 800,
        vslStarts: 600,
        applications: 150,
        accepted: 55,
        meetingsBooked: 45,
        applicationRate: 0.1875,
      },
      {
        source: null,
        onboardingViews: 150,
        vslStarts: 90,
        applications: 10,
        accepted: 3,
        meetingsBooked: 2,
        applicationRate: 0.0667,
      },
      {
        source: 'tiktok',
        onboardingViews: 50,
        vslStarts: 30,
        applications: 0,
        accepted: 0,
        meetingsBooked: 0,
        applicationRate: 0,
      },
      {
        source: 'referral',
        onboardingViews: 0,
        vslStarts: 0,
        applications: 20,
        accepted: 6,
        meetingsBooked: 4,
        applicationRate: null,
      },
    ]);
  });

  it('passes filters through and limits the breakdown to the filtered source', async () => {
    const repo = repository();
    const from = new Date('2026-05-01T00:00:00Z');
    const report = await createAnalyticsService({ repository: repo }).getFunnel({
      from,
      to: undefined,
      source: 'instagram',
      campaign: 'bio',
    });
    expect(repo.calls[0]).toEqual({ from, to: NOW, source: 'instagram', campaign: 'bio' });
    expect(report.filters).toEqual({ source: 'instagram', campaign: 'bio' });
    expect(report.bySource.map((r) => r.source)).toEqual(['instagram']);
  });

  it('returns null ratios (never NaN or Infinity) for an empty period', async () => {
    const zero = {
      onboardingViews: 0,
      vslStarts: 0,
      vsl25: 0,
      vsl50: 0,
      vsl75: 0,
      vslCompletes: 0,
      applicationStarts: 0,
      applicationSubmits: 0,
      schedulingOpened: 0,
    };
    const report = await createAnalyticsService({
      repository: repository({
        clientStageCounts: () => Promise.resolve(zero),
        applicationCohort: () =>
          Promise.resolve({ applications: 0, accepted: 0, rejected: 0, meetingsBooked: 0 }),
        clientBySource: () => Promise.resolve([]),
        cohortBySource: () => Promise.resolve([]),
      }),
    }).getFunnel({ from: undefined, to: undefined, source: undefined, campaign: undefined });

    expect(Object.values(report.conversion).every((value) => value === null)).toBe(true);
    expect(report.bySource).toEqual([]);
  });

  it('refuses ranges longer than 366 days', async () => {
    await expect(
      createAnalyticsService({ repository: repository() }).getFunnel({
        from: new Date('2024-01-01T00:00:00Z'),
        to: NOW,
        source: undefined,
        campaign: undefined,
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
  });
});
