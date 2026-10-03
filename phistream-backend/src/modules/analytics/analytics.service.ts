import type { AnalyticsRepository } from './analytics.repository.js';
import {
  DEFAULT_FUNNEL_RANGE_DAYS,
  MAX_FUNNEL_RANGE_DAYS,
  type AnalyticsEventRequest,
  type FunnelQuery,
  type FunnelReport,
} from './analytics.schemas.js';
import { AppError } from '../../shared/errors/app-error.js';

/**
 * Funnel analytics (BUILD_PLAN Phase 8).
 *
 * Recording stores exactly the validated, minimized fields: no IP address,
 * user agent, cookies, or free-form metadata. Reporting combines client
 * stage counts (distinct anonymous sessions) with authoritative application
 * outcomes, and computes every ratio on the server.
 */

export interface AnalyticsService {
  record(event: AnalyticsEventRequest): Promise<void>;
  getFunnel(query: FunnelQuery): Promise<FunnelReport>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SOURCES = 50;

/** numerator / denominator rounded to 4 decimals; null when undefined. */
export function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 10_000 : null;
}

export function createAnalyticsService(deps: {
  repository: AnalyticsRepository;
}): AnalyticsService {
  const { repository } = deps;

  return {
    async record(event) {
      await repository.insertEvent({
        eventName: event.event,
        anonymousSessionId: event.anonymousSessionId,
        source: event.source ?? null,
        campaign: event.campaign ?? null,
        path: event.path ?? null,
        referrer: event.referrer ?? null,
      });
    },

    async getFunnel(query) {
      // Default end: the database clock (events carry database timestamps).
      const to = query.to ?? (await repository.currentTime());
      const from = query.from ?? new Date(to.getTime() - DEFAULT_FUNNEL_RANGE_DAYS * DAY_MS);
      if (to.getTime() - from.getTime() > MAX_FUNNEL_RANGE_DAYS * DAY_MS) {
        throw new AppError(400, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
          {
            location: 'querystring',
            path: '/from',
            message: `range must not exceed ${MAX_FUNNEL_RANGE_DAYS} days`,
          },
        ]);
      }
      const filter = { from, to, source: query.source, campaign: query.campaign };

      const [client, cohort, clientSources, cohortSources] = await Promise.all([
        repository.clientStageCounts(filter),
        repository.applicationCohort(filter),
        repository.clientBySource(filter),
        repository.cohortBySource(filter),
      ]);

      const bySourceMap = new Map<string | null, FunnelReport['bySource'][number]>();
      const entry = (source: string | null) => {
        let row = bySourceMap.get(source);
        if (!row) {
          row = {
            source,
            onboardingViews: 0,
            vslStarts: 0,
            applications: 0,
            accepted: 0,
            meetingsBooked: 0,
            applicationRate: null,
          };
          bySourceMap.set(source, row);
        }
        return row;
      };
      for (const row of clientSources)
        Object.assign(entry(row.source), {
          onboardingViews: row.onboardingViews,
          vslStarts: row.vslStarts,
        });
      for (const row of cohortSources) {
        Object.assign(entry(row.source), {
          applications: row.applications,
          accepted: row.accepted,
          meetingsBooked: row.meetingsBooked,
        });
      }
      const bySource = [...bySourceMap.values()]
        .filter((row) => query.source === undefined || row.source === query.source)
        .map((row) => ({ ...row, applicationRate: rate(row.applications, row.onboardingViews) }))
        .sort(
          (a, b) =>
            b.onboardingViews + b.applications - (a.onboardingViews + a.applications) ||
            String(a.source).localeCompare(String(b.source)),
        )
        .slice(0, MAX_SOURCES);

      return {
        period: { from, to },
        filters: { source: query.source ?? null, campaign: query.campaign ?? null },
        funnel: {
          onboardingViews: client.onboardingViews,
          vslStarts: client.vslStarts,
          vslCompletes: client.vslCompletes,
          applicationStarts: client.applicationStarts,
          applications: cohort.applications,
          accepted: cohort.accepted,
          rejected: cohort.rejected,
          meetingsBooked: cohort.meetingsBooked,
        },
        conversion: {
          vslStartRate: rate(client.vslStarts, client.onboardingViews),
          vslCompletionRate: rate(client.vslCompletes, client.vslStarts),
          applicationRate: rate(cohort.applications, client.onboardingViews),
          applicationCompletionRate: rate(cohort.applications, client.applicationStarts),
          acceptanceRate: rate(cohort.accepted, cohort.accepted + cohort.rejected),
          bookingRate: rate(cohort.meetingsBooked, cohort.accepted),
          overallRate: rate(cohort.meetingsBooked, client.onboardingViews),
        },
        vslProgress: {
          started: client.vslStarts,
          reached25: client.vsl25,
          reached50: client.vsl50,
          reached75: client.vsl75,
          completed: client.vslCompletes,
        },
        clientReported: {
          applicationSubmits: client.applicationSubmits,
          schedulingOpened: client.schedulingOpened,
        },
        bySource,
      };
    },
  };
}
