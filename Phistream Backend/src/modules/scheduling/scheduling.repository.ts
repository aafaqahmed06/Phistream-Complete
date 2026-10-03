import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';

import type { Db, DbTransaction } from '../../db/client.js';
import type { MeetingStatus, SchedulingWebhookOutcome } from '../../db/schema/enums.js';
import {
  applications,
  leads,
  meetings,
  schedulingSessions,
  schedulingWebhookEvents,
} from '../../db/schema/index.js';
import {
  lockApplication,
  type LifecycleTransaction,
} from '../applications/applications.repository.js';
import {
  enqueueNotificationEvent,
  type NotificationEventInput,
} from '../notifications/notification-outbox.js';

/**
 * Data access for scheduling sessions, meetings, and provider webhooks.
 * PRIVATE data. Only token/reference hashes are ever stored.
 */

export interface MeetingRow {
  readonly id: string;
  readonly applicationId: string;
  readonly providerEventId: string | null;
  readonly status: MeetingStatus;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly meetingUrl: string | null;
}

export interface NewMeeting {
  readonly applicationId: string;
  readonly provider: string;
  readonly providerEventId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly meetingUrl: string | null;
}

export interface SessionState {
  readonly id: string;
  readonly hasToken: boolean;
}

export interface SessionUpsert {
  readonly provider: string;
  readonly tokenHash: string;
  readonly bookingRefHash: string;
  readonly expiresAt: Date;
}

/** Inside the issuance transaction (application row locked). */
export interface IssueTransaction {
  readonly lifecycle: LifecycleTransaction;
  findSession(): Promise<SessionState | undefined>;
  /** Creates or rotates the application's session; returns its id. */
  upsertSession(session: SessionUpsert): Promise<string>;
}

export interface ResolvableSession {
  readonly sessionId: string;
  readonly expiresAt: Date;
  readonly attendee: { readonly name: string; readonly email: string };
}

/** Inside the webhook transaction (the dedup row is already inserted). */
export interface WebhookTransaction {
  readonly webhookEventId: string;
  findApplicationIdByBookingRefHash(hash: string): Promise<string | undefined>;
  findMeetingByBookingId(bookingId: string): Promise<MeetingRow | undefined>;
  /** Latest SCHEDULED meeting of the application. */
  findActiveMeeting(applicationId: string): Promise<MeetingRow | undefined>;
  lockApplication(applicationId: string): Promise<LifecycleTransaction | undefined>;
  insertMeeting(meeting: NewMeeting): Promise<string>;
  setMeetingStatus(meetingId: string, status: MeetingStatus): Promise<void>;
  setSessionUsedAt(applicationId: string, usedAt: Date | null): Promise<void>;
  enqueueNotificationEvent(event: NotificationEventInput): Promise<void>;
}

export interface WebhookResult {
  readonly outcome: SchedulingWebhookOutcome;
  readonly bookingId?: string | undefined;
  readonly applicationId?: string | undefined;
}

export interface SchedulingRepository {
  /** Undefined if the application does not exist. */
  withApplicationForIssue<T>(
    applicationId: string,
    work: (tx: IssueTransaction) => Promise<T>,
  ): Promise<T | undefined>;
  /**
   * The session for this token, only if the token is unexpired and unused
   * and the application is still waiting for a booking (SCHEDULING_OPEN).
   */
  findResolvableSession(tokenHash: string, now: Date): Promise<ResolvableSession | undefined>;
  /**
   * Records the event (provider, eventId) and runs `work` in the same
   * transaction. A repeated event id is a no-op ({ duplicate: true }); if
   * `work` throws, the record is rolled back so a provider retry is processed.
   */
  processWebhookOnce(
    input: { provider: string; eventId: string; eventType: string; now: Date },
    work: (tx: WebhookTransaction) => Promise<WebhookResult>,
  ): Promise<{ duplicate: true } | { duplicate: false; result: WebhookResult }>;
  findLatestMeeting(applicationId: string): Promise<MeetingRow | undefined>;
}

const meetingColumns = {
  id: meetings.id,
  applicationId: meetings.applicationId,
  providerEventId: meetings.providerEventId,
  status: meetings.status,
  startsAt: meetings.startsAt,
  endsAt: meetings.endsAt,
  meetingUrl: meetings.meetingUrl,
};

export function createSchedulingRepository(db: Db, providerName: string): SchedulingRepository {
  function webhookOperations(tx: DbTransaction, webhookEventId: string): WebhookTransaction {
    return {
      webhookEventId,

      async findApplicationIdByBookingRefHash(hash) {
        const rows = await tx
          .select({ applicationId: schedulingSessions.applicationId })
          .from(schedulingSessions)
          .where(eq(schedulingSessions.bookingRefHash, hash))
          .limit(1);
        return rows[0]?.applicationId;
      },

      async findMeetingByBookingId(bookingId) {
        const rows = await tx
          .select(meetingColumns)
          .from(meetings)
          .where(and(eq(meetings.provider, providerName), eq(meetings.providerEventId, bookingId)))
          .limit(1);
        return rows[0];
      },

      async findActiveMeeting(applicationId) {
        const rows = await tx
          .select(meetingColumns)
          .from(meetings)
          .where(and(eq(meetings.applicationId, applicationId), eq(meetings.status, 'SCHEDULED')))
          .orderBy(desc(meetings.createdAt))
          .limit(1);
        return rows[0];
      },

      lockApplication: (applicationId) => lockApplication(tx, applicationId),

      async insertMeeting(meeting) {
        const [row] = await tx
          .insert(meetings)
          .values({ ...meeting, status: 'SCHEDULED' })
          .returning({ id: meetings.id });
        if (!row) throw new Error('meeting insert returned no row');
        return row.id;
      },

      async setMeetingStatus(meetingId, status) {
        await tx.update(meetings).set({ status }).where(eq(meetings.id, meetingId));
      },

      async setSessionUsedAt(applicationId, usedAt) {
        await tx
          .update(schedulingSessions)
          .set({ usedAt })
          .where(eq(schedulingSessions.applicationId, applicationId));
      },

      enqueueNotificationEvent: (event) => enqueueNotificationEvent(tx, event),
    };
  }

  return {
    async withApplicationForIssue(applicationId, work) {
      return db.transaction(async (tx) => {
        const lifecycle = await lockApplication(tx, applicationId);
        if (!lifecycle) return undefined;
        return work({
          lifecycle,
          async findSession() {
            const rows = await tx
              .select({ id: schedulingSessions.id, tokenHash: schedulingSessions.tokenHash })
              .from(schedulingSessions)
              .where(eq(schedulingSessions.applicationId, applicationId))
              .limit(1);
            const row = rows[0];
            return row && { id: row.id, hasToken: row.tokenHash !== null };
          },
          async upsertSession(session) {
            const values = { ...session, usedAt: null };
            const [row] = await tx
              .insert(schedulingSessions)
              .values({ applicationId, ...values })
              .onConflictDoUpdate({ target: schedulingSessions.applicationId, set: values })
              .returning({ id: schedulingSessions.id });
            if (!row) throw new Error('session upsert returned no row');
            return row.id;
          },
        });
      });
    },

    async findResolvableSession(tokenHash, now) {
      const rows = await db
        .select({
          sessionId: schedulingSessions.id,
          expiresAt: schedulingSessions.expiresAt,
          name: leads.fullName,
          email: leads.email,
        })
        .from(schedulingSessions)
        .innerJoin(applications, eq(applications.id, schedulingSessions.applicationId))
        .innerJoin(leads, eq(leads.id, applications.leadId))
        .where(
          and(
            eq(schedulingSessions.tokenHash, tokenHash),
            gt(schedulingSessions.expiresAt, now),
            isNull(schedulingSessions.usedAt),
            eq(applications.status, 'SCHEDULING_OPEN'),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row?.expiresAt) return undefined;
      return {
        sessionId: row.sessionId,
        expiresAt: row.expiresAt,
        attendee: { name: row.name, email: row.email },
      };
    },

    async processWebhookOnce({ provider, eventId, eventType, now }, work) {
      return db.transaction(async (tx) => {
        const [recorded] = await tx
          .insert(schedulingWebhookEvents)
          .values({ provider, providerEventId: eventId, eventType, receivedAt: now })
          .onConflictDoNothing({
            target: [schedulingWebhookEvents.provider, schedulingWebhookEvents.providerEventId],
          })
          .returning({ id: schedulingWebhookEvents.id });
        if (!recorded) return { duplicate: true } as const;

        const result = await work(webhookOperations(tx, recorded.id));
        await tx
          .update(schedulingWebhookEvents)
          .set({
            outcome: result.outcome,
            bookingId: result.bookingId ?? null,
            applicationId: result.applicationId ?? null,
            processedAt: sql`clock_timestamp()`,
          })
          .where(eq(schedulingWebhookEvents.id, recorded.id));
        return { duplicate: false, result } as const;
      });
    },

    async findLatestMeeting(applicationId) {
      const rows = await db
        .select(meetingColumns)
        .from(meetings)
        .where(eq(meetings.applicationId, applicationId))
        .orderBy(desc(meetings.createdAt))
        .limit(1);
      return rows[0];
    },
  };
}
