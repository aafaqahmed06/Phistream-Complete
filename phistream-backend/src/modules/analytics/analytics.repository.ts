import { and, eq, gte, inArray, lt, sql, type SQL } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import { analyticsEvents, applications, meetings } from '../../db/schema/index.js';
import { CLIENT_ANALYTICS_EVENTS, type ClientAnalyticsEvent } from './analytics.schemas.js';

/**
 * Analytics persistence and aggregation. PRIVATE: aggregates only ever leave
 * this module; no row-level visitor data is served.
 *
 * Two bases, never mixed:
 * - client stages: DISTINCT anonymous sessions per event in [from, to);
 * - authoritative stages: the cohort of applications SUBMITTED in [from, to),
 *   with their outcome so far (accepted_at, a review decision, meetings).
 *   These come from the applications/meetings tables, never from
 *   analytics_events, so the browser cannot influence them.
 */

export interface NewAnalyticsEvent {
  readonly eventName: ClientAnalyticsEvent;
  readonly anonymousSessionId: string;
  readonly source: string | null;
  readonly campaign: string | null;
  readonly path: string | null;
  readonly referrer: string | null;
}

export interface FunnelFilter {
  readonly from: Date;
  readonly to: Date;
  readonly source?: string | undefined;
  readonly campaign?: string | undefined;
}

export interface ClientStageCounts {
  onboardingViews: number;
  vslStarts: number;
  vsl25: number;
  vsl50: number;
  vsl75: number;
  vslCompletes: number;
  applicationStarts: number;
  applicationSubmits: number;
  schedulingOpened: number;
}

export interface CohortCounts {
  applications: number;
  accepted: number;
  rejected: number;
  meetingsBooked: number;
}

export interface AnalyticsRepository {
  /**
   * The database clock. Events are timestamped by the database, so default
   * report periods must end at database time, not an app server's.
   */
  currentTime(): Promise<Date>;
  insertEvent(event: NewAnalyticsEvent): Promise<void>;
  clientStageCounts(filter: FunnelFilter): Promise<ClientStageCounts>;
  applicationCohort(filter: FunnelFilter): Promise<CohortCounts>;
  /** Grouped by source (null = none); ignores `filter.source`. */
  clientBySource(
    filter: FunnelFilter,
  ): Promise<
    ({ source: string | null } & Pick<ClientStageCounts, 'onboardingViews' | 'vslStarts'>)[]
  >;
  cohortBySource(
    filter: FunnelFilter,
  ): Promise<
    ({ source: string | null } & Pick<
      CohortCounts,
      'applications' | 'accepted' | 'meetingsBooked'
    >)[]
  >;
}

const sessionsWith = (event: ClientAnalyticsEvent) =>
  sql<number>`(count(distinct ${analyticsEvents.anonymousSessionId}) filter (where ${analyticsEvents.eventName} = ${event}))::int`;

const cohort = {
  applications: sql<number>`count(*)::int`,
  accepted: sql<number>`(count(*) filter (where ${applications.acceptedAt} is not null))::int`,
  // A review decision without acceptance (stays true if later archived).
  rejected: sql<number>`(count(*) filter (where ${applications.reviewedAt} is not null and ${applications.acceptedAt} is null))::int`,
  // The outer column must be table-qualified: Drizzle renders a bare `"id"` in
  // single-table selects, which inside this subquery would bind to meetings.id.
  meetingsBooked: sql<number>`(count(*) filter (where exists (select 1 from ${meetings} where ${meetings.applicationId} = "applications"."id")))::int`,
};

export function createAnalyticsRepository(db: Db): AnalyticsRepository {
  function eventWhere(filter: FunnelFilter, bySource = false): SQL | undefined {
    return and(
      gte(analyticsEvents.createdAt, filter.from),
      lt(analyticsEvents.createdAt, filter.to),
      inArray(analyticsEvents.eventName, [...CLIENT_ANALYTICS_EVENTS]),
      !bySource && filter.source !== undefined
        ? eq(analyticsEvents.source, filter.source)
        : undefined,
      filter.campaign !== undefined ? eq(analyticsEvents.campaign, filter.campaign) : undefined,
    );
  }

  function cohortWhere(filter: FunnelFilter, bySource = false): SQL | undefined {
    return and(
      gte(applications.submittedAt, filter.from),
      lt(applications.submittedAt, filter.to),
      !bySource && filter.source !== undefined ? eq(applications.source, filter.source) : undefined,
      filter.campaign !== undefined ? eq(applications.campaign, filter.campaign) : undefined,
    );
  }

  return {
    async currentTime() {
      const result = await db.execute<{ now: Date }>(sql`select now() as now`);
      const now = result.rows[0]?.now;
      if (!now) throw new Error('database returned no time');
      return new Date(now);
    },

    async insertEvent(event) {
      await db.insert(analyticsEvents).values(event);
    },

    async clientStageCounts(filter) {
      const [row] = await db
        .select({
          onboardingViews: sessionsWith('onboarding_view'),
          vslStarts: sessionsWith('vsl_start'),
          vsl25: sessionsWith('vsl_25'),
          vsl50: sessionsWith('vsl_50'),
          vsl75: sessionsWith('vsl_75'),
          vslCompletes: sessionsWith('vsl_complete'),
          applicationStarts: sessionsWith('application_start'),
          applicationSubmits: sessionsWith('application_submit'),
          schedulingOpened: sessionsWith('scheduling_opened'),
        })
        .from(analyticsEvents)
        .where(eventWhere(filter));
      return (
        row ?? {
          onboardingViews: 0,
          vslStarts: 0,
          vsl25: 0,
          vsl50: 0,
          vsl75: 0,
          vslCompletes: 0,
          applicationStarts: 0,
          applicationSubmits: 0,
          schedulingOpened: 0,
        }
      );
    },

    async applicationCohort(filter) {
      const [row] = await db.select(cohort).from(applications).where(cohortWhere(filter));
      return row ?? { applications: 0, accepted: 0, rejected: 0, meetingsBooked: 0 };
    },

    clientBySource(filter) {
      return db
        .select({
          source: analyticsEvents.source,
          onboardingViews: sessionsWith('onboarding_view'),
          vslStarts: sessionsWith('vsl_start'),
        })
        .from(analyticsEvents)
        .where(eventWhere(filter, true))
        .groupBy(analyticsEvents.source);
    },

    cohortBySource(filter) {
      return db
        .select({
          source: applications.source,
          applications: cohort.applications,
          accepted: cohort.accepted,
          meetingsBooked: cohort.meetingsBooked,
        })
        .from(applications)
        .where(cohortWhere(filter, true))
        .groupBy(applications.source);
    },
  };
}
