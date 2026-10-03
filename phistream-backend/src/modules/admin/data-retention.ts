import { and, count, eq, inArray, isNotNull, lt, or, sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import {
  analyticsEvents,
  applicationAccessTokens,
  applications,
  contactSubmissions,
  leads,
  meetings,
  notificationEvents,
  schedulingWebhookEvents,
} from '../../db/schema/index.js';
import { insertAuditLog } from './audit-log.js';

/**
 * Privacy operations (DATA_MODEL.md › Privacy: "Add retention/deletion
 * capability").
 *
 * Erasure removes a person from this system: the lead and, by cascade, their
 * contact messages, applications, answers, notes, lifecycle events, access
 * tokens, scheduling sessions, and meetings. Notification events about those
 * records are deleted too (cascading to delivery rows, which hold email
 * addresses). Anonymous analytics rows and webhook records are unlinked
 * (SET NULL). Audit entries keep only ids and counts, no personal data.
 *
 * Data held by providers (Cal.com bookings, Resend logs, Supabase Auth users)
 * is outside this database and must be erased there as well (see
 * PRODUCTION_READINESS.md).
 */

export interface ErasureSummary {
  readonly applications: number;
  readonly contactSubmissions: number;
  readonly notificationEvents: number;
}

export async function eraseLead(
  db: Db,
  leadId: string,
  actorId: string | null,
): Promise<ErasureSummary | undefined> {
  return db.transaction(async (tx) => {
    const [lead] = await tx
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.id, leadId))
      .for('update');
    if (!lead) return undefined;

    const applicationIds = (
      await tx
        .select({ id: applications.id })
        .from(applications)
        .where(eq(applications.leadId, leadId))
    ).map((row) => row.id);
    const submissionIds = (
      await tx
        .select({ id: contactSubmissions.id })
        .from(contactSubmissions)
        .where(eq(contactSubmissions.leadId, leadId))
    ).map((row) => row.id);
    const meetingIds =
      applicationIds.length === 0
        ? []
        : (
            await tx
              .select({ id: meetings.id })
              .from(meetings)
              .where(inArray(meetings.applicationId, applicationIds))
          ).map((row) => row.id);

    // Outbox events about this person's records (deliveries cascade with them).
    const subjects = [
      ['application', applicationIds],
      ['contact_submission', submissionIds],
      ['meeting', meetingIds],
    ] as const;
    const subjectConditions = subjects
      .filter(([, ids]) => ids.length > 0)
      .map(([type, ids]) =>
        and(
          eq(notificationEvents.subjectType, type),
          inArray(notificationEvents.subjectId, [...ids]),
        ),
      );
    const deletedEvents =
      subjectConditions.length === 0
        ? []
        : await tx
            .delete(notificationEvents)
            .where(or(...subjectConditions))
            .returning({ id: notificationEvents.id });

    await tx.delete(leads).where(eq(leads.id, leadId));

    const summary = {
      applications: applicationIds.length,
      contactSubmissions: submissionIds.length,
      notificationEvents: deletedEvents.length,
    };
    await insertAuditLog(tx, {
      actorId,
      action: 'lead.erased',
      entityType: 'lead',
      entityId: leadId,
      metadata: summary,
    });
    return summary;
  });
}

// ---- Retention -------------------------------------------------------------------------

export interface RetentionPolicy {
  /** Anonymous funnel events. */
  readonly analyticsDays: number;
  /** Settled notification events (and their delivery rows with addresses). */
  readonly notificationDays: number;
  /** Provider webhook records (no payloads, ids only). */
  readonly webhookDays: number;
  /** Applicant status tokens, counted from their expiry. */
  readonly expiredTokenDays: number;
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  analyticsDays: 395, // 13 months: a year-over-year comparison
  notificationDays: 365,
  webhookDays: 365,
  expiredTokenDays: 30,
};

export interface RetentionResult {
  readonly analyticsEvents: number;
  readonly notificationEvents: number;
  readonly schedulingWebhookEvents: number;
  readonly applicationAccessTokens: number;
}

const olderThan = (days: number) => sql`now() - make_interval(days => ${days})`;

/**
 * Deletes operational data past its retention period, in one transaction,
 * using the database clock. `dryRun` only counts. Business records (leads,
 * applications, meetings, audit logs) are never deleted here: removing a
 * person is an explicit erasure.
 */
export async function applyRetention(
  db: Db,
  policy: RetentionPolicy,
  options: { dryRun: boolean },
): Promise<RetentionResult> {
  const conditions = {
    analytics: lt(analyticsEvents.createdAt, olderThan(policy.analyticsDays)),
    notifications: and(
      inArray(notificationEvents.status, ['PROCESSED', 'FAILED']),
      lt(notificationEvents.createdAt, olderThan(policy.notificationDays)),
    ),
    webhooks: and(
      isNotNull(schedulingWebhookEvents.processedAt),
      lt(schedulingWebhookEvents.receivedAt, olderThan(policy.webhookDays)),
    ),
    tokens: lt(applicationAccessTokens.expiresAt, olderThan(policy.expiredTokenDays)),
  };

  return db.transaction(async (tx) => {
    if (options.dryRun) {
      const total = async (query: Promise<{ n: number }[]>) => (await query)[0]?.n ?? 0;
      return {
        analyticsEvents: await total(
          tx.select({ n: count() }).from(analyticsEvents).where(conditions.analytics),
        ),
        notificationEvents: await total(
          tx.select({ n: count() }).from(notificationEvents).where(conditions.notifications),
        ),
        schedulingWebhookEvents: await total(
          tx.select({ n: count() }).from(schedulingWebhookEvents).where(conditions.webhooks),
        ),
        applicationAccessTokens: await total(
          tx.select({ n: count() }).from(applicationAccessTokens).where(conditions.tokens),
        ),
      };
    }

    const result = {
      analyticsEvents: (
        await tx
          .delete(analyticsEvents)
          .where(conditions.analytics)
          .returning({ id: analyticsEvents.id })
      ).length,
      notificationEvents: (
        await tx
          .delete(notificationEvents)
          .where(conditions.notifications)
          .returning({ id: notificationEvents.id })
      ).length,
      schedulingWebhookEvents: (
        await tx
          .delete(schedulingWebhookEvents)
          .where(conditions.webhooks)
          .returning({ id: schedulingWebhookEvents.id })
      ).length,
      applicationAccessTokens: (
        await tx
          .delete(applicationAccessTokens)
          .where(conditions.tokens)
          .returning({ id: applicationAccessTokens.id })
      ).length,
    };
    await insertAuditLog(tx, {
      actorId: null,
      action: 'retention.applied',
      entityType: 'system',
      entityId: null,
      metadata: { policy, deleted: result },
    });
    return result;
  });
}
