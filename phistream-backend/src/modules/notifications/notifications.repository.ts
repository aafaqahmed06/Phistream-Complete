import { and, asc, count, desc, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import type { NotificationEventStatus, NotificationStatus } from '../../db/schema/enums.js';
import { notificationDeliveries, notificationEvents } from '../../db/schema/index.js';
import { insertAuditLog } from '../admin/audit-log.js';

/**
 * Outbox and delivery persistence for the notification dispatcher. PRIVATE
 * (delivery rows contain recipient addresses).
 *
 * Claiming is a short transaction (`FOR UPDATE SKIP LOCKED` + a lease), so
 * several API instances can run the worker without double-processing, and
 * no transaction is held open while talking to the email provider.
 */

export interface ClaimedEvent {
  readonly id: string;
  readonly eventType: string;
  readonly subjectType: string;
  readonly subjectId: string;
  /** Including this claim. */
  readonly attempts: number;
}

export interface DeliveryKey {
  readonly notificationEventId: string;
  readonly template: string;
  readonly eventType: string;
  readonly recipient: string;
  readonly provider: string;
}

export interface DeliveryState {
  readonly id: string;
  readonly status: NotificationStatus;
}

export interface NotificationEventListItem {
  id: string;
  eventType: string;
  subjectType: string;
  subjectId: string;
  status: NotificationEventStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: Date;
  processedAt: Date | null;
  createdAt: Date;
  deliveries: {
    id: string;
    template: string;
    recipient: string;
    provider: string;
    status: NotificationStatus;
    attempts: number;
    lastError: string | null;
    providerMessageId: string | null;
    sentAt: Date | null;
  }[];
}

/**
 * All queue timing uses the DATABASE clock (`now()`): events get database
 * timestamps when they are written, so comparing them with an application
 * server's clock would make them late (or early) under clock skew. Callers
 * therefore pass delays, never absolute times.
 */
export interface NotificationsRepository {
  claimDue(input: { limit: number; leaseMs: number }): Promise<ClaimedEvent[]>;
  completeEvent(id: string): Promise<void>;
  /** Keeps the event PENDING and schedules another attempt `delayMs` from now. */
  retryEvent(id: string, error: string, delayMs: number): Promise<void>;
  /** Dead letter: FAILED until an admin requeues it. */
  failEvent(id: string, error: string): Promise<void>;
  /** Gives a claimed, unprocessed event back (lease cleared, attempt refunded). */
  releaseEvent(id: string): Promise<void>;
  /** Creates the delivery row once; returns its current state. */
  ensureDelivery(key: DeliveryKey): Promise<DeliveryState>;
  markDeliverySent(
    id: string,
    input: { provider: string; providerMessageId: string },
  ): Promise<void>;
  markDeliveryFailed(id: string, input: { provider: string; error: string }): Promise<void>;
  listEvents(filters: {
    status?: NotificationEventStatus | undefined;
    eventType?: string | undefined;
    limit: number;
    offset: number;
  }): Promise<{ items: NotificationEventListItem[]; total: number }>;
  /** FAILED → PENDING (attempts reset), audited. Resolves false if not FAILED. */
  requeue(id: string, actorId: string): Promise<'requeued' | 'not_failed' | 'not_found'>;
}

export function createNotificationsRepository(db: Db): NotificationsRepository {
  const settle = (id: string) => eq(notificationEvents.id, id);

  return {
    async claimDue({ limit, leaseMs }) {
      return db.transaction(async (tx) => {
        const due = await tx
          .select({ id: notificationEvents.id })
          .from(notificationEvents)
          .where(
            and(
              eq(notificationEvents.status, 'PENDING'),
              lte(notificationEvents.nextAttemptAt, sql`now()`),
              or(
                isNull(notificationEvents.lockedUntil),
                lt(notificationEvents.lockedUntil, sql`now()`),
              ),
            ),
          )
          .orderBy(asc(notificationEvents.nextAttemptAt), asc(notificationEvents.createdAt))
          .limit(limit)
          .for('update', { skipLocked: true });
        if (due.length === 0) return [];

        return tx
          .update(notificationEvents)
          .set({
            lockedUntil: sql`now() + make_interval(secs => ${leaseMs / 1000})`,
            attempts: sql`${notificationEvents.attempts} + 1`,
          })
          .where(
            inArray(
              notificationEvents.id,
              due.map((row) => row.id),
            ),
          )
          .returning({
            id: notificationEvents.id,
            eventType: notificationEvents.eventType,
            subjectType: notificationEvents.subjectType,
            subjectId: notificationEvents.subjectId,
            attempts: notificationEvents.attempts,
          });
      });
    },

    async completeEvent(id) {
      await db
        .update(notificationEvents)
        .set({ status: 'PROCESSED', processedAt: sql`now()`, lockedUntil: null, lastError: null })
        .where(settle(id));
    },

    async retryEvent(id, error, delayMs) {
      await db
        .update(notificationEvents)
        .set({
          status: 'PENDING',
          lastError: error,
          nextAttemptAt: sql`now() + make_interval(secs => ${delayMs / 1000})`,
          lockedUntil: null,
        })
        .where(settle(id));
    },

    async failEvent(id, error) {
      await db
        .update(notificationEvents)
        .set({ status: 'FAILED', lastError: error, lockedUntil: null })
        .where(settle(id));
    },

    async releaseEvent(id) {
      await db
        .update(notificationEvents)
        .set({ lockedUntil: null, attempts: sql`greatest(${notificationEvents.attempts} - 1, 0)` })
        .where(settle(id));
    },

    async ensureDelivery(key) {
      await db
        .insert(notificationDeliveries)
        .values(key)
        .onConflictDoNothing({
          target: [
            notificationDeliveries.notificationEventId,
            notificationDeliveries.template,
            notificationDeliveries.recipient,
          ],
        });
      const [row] = await db
        .select({ id: notificationDeliveries.id, status: notificationDeliveries.status })
        .from(notificationDeliveries)
        .where(
          and(
            eq(notificationDeliveries.notificationEventId, key.notificationEventId),
            eq(notificationDeliveries.template, key.template),
            eq(notificationDeliveries.recipient, key.recipient),
          ),
        )
        .limit(1);
      if (!row) throw new Error('delivery row missing after insert');
      return row;
    },

    async markDeliverySent(id, { provider, providerMessageId }) {
      await db
        .update(notificationDeliveries)
        .set({
          status: 'SENT',
          provider,
          providerMessageId,
          sentAt: sql`now()`,
          lastError: null,
          attempts: sql`${notificationDeliveries.attempts} + 1`,
        })
        .where(eq(notificationDeliveries.id, id));
    },

    async markDeliveryFailed(id, { provider, error }) {
      await db
        .update(notificationDeliveries)
        .set({
          status: 'FAILED',
          provider,
          lastError: error,
          attempts: sql`${notificationDeliveries.attempts} + 1`,
        })
        .where(eq(notificationDeliveries.id, id));
    },

    async listEvents({ status, eventType, limit, offset }) {
      const where = and(
        status ? eq(notificationEvents.status, status) : undefined,
        eventType ? eq(notificationEvents.eventType, eventType) : undefined,
      );
      const [events, totals] = await Promise.all([
        db
          .select({
            id: notificationEvents.id,
            eventType: notificationEvents.eventType,
            subjectType: notificationEvents.subjectType,
            subjectId: notificationEvents.subjectId,
            status: notificationEvents.status,
            attempts: notificationEvents.attempts,
            lastError: notificationEvents.lastError,
            nextAttemptAt: notificationEvents.nextAttemptAt,
            processedAt: notificationEvents.processedAt,
            createdAt: notificationEvents.createdAt,
          })
          .from(notificationEvents)
          .where(where)
          .orderBy(desc(notificationEvents.createdAt), desc(notificationEvents.id))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(notificationEvents).where(where),
      ]);
      const deliveries =
        events.length === 0
          ? []
          : await db
              .select({
                id: notificationDeliveries.id,
                eventId: notificationDeliveries.notificationEventId,
                template: notificationDeliveries.template,
                recipient: notificationDeliveries.recipient,
                provider: notificationDeliveries.provider,
                status: notificationDeliveries.status,
                attempts: notificationDeliveries.attempts,
                lastError: notificationDeliveries.lastError,
                providerMessageId: notificationDeliveries.providerMessageId,
                sentAt: notificationDeliveries.sentAt,
              })
              .from(notificationDeliveries)
              .where(
                inArray(
                  notificationDeliveries.notificationEventId,
                  events.map((e) => e.id),
                ),
              )
              .orderBy(asc(notificationDeliveries.createdAt));
      return {
        total: totals[0]?.total ?? 0,
        items: events.map((event) => ({
          ...event,
          deliveries: deliveries
            .filter((d) => d.eventId === event.id)
            .map(({ eventId: _eventId, ...delivery }) => delivery),
        })),
      };
    },

    async requeue(id, actorId) {
      return db.transaction(async (tx) => {
        const [event] = await tx
          .select({ status: notificationEvents.status, eventType: notificationEvents.eventType })
          .from(notificationEvents)
          .where(eq(notificationEvents.id, id))
          .for('update');
        if (!event) return 'not_found' as const;
        if (event.status !== 'FAILED') return 'not_failed' as const;
        await tx
          .update(notificationEvents)
          .set({ status: 'PENDING', attempts: 0, nextAttemptAt: sql`now()`, lockedUntil: null })
          .where(eq(notificationEvents.id, id));
        await insertAuditLog(tx, {
          actorId,
          action: 'notification.requeued',
          entityType: 'notification_event',
          entityId: id,
          metadata: { eventType: event.eventType },
        });
        return 'requeued' as const;
      });
    },
  };
}
