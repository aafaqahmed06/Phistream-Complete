import type { DbExecutor } from '../../db/client.js';
import { notificationEvents } from '../../db/schema/index.js';

/**
 * Internal notification events. Add types deliberately: the notification
 * worker (Phase 7) maps each one to a template and recipients.
 */
export const NOTIFICATION_EVENT_TYPES = [
  'CONTACT_RECEIVED',
  'APPLICATION_SUBMITTED',
  'APPLICATION_ACCEPTED',
  'APPLICATION_REJECTED',
  'MEETING_BOOKED',
  'MEETING_RESCHEDULED',
  'MEETING_CANCELLED',
  /** A provider booking could not be linked, or came from an ineligible application. */
  'SCHEDULING_BOOKING_NEEDS_ATTENTION',
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export interface NotificationEventInput {
  readonly eventType: NotificationEventType;
  /** Entity the event is about, e.g. "contact_submission". */
  readonly subjectType: string;
  readonly subjectId: string;
}

/**
 * Adds an event to the outbox. Pass the transaction that performs the related
 * state change so both commit (or roll back) together. Enqueueing the same
 * event for the same subject twice is a no-op.
 */
export async function enqueueNotificationEvent(
  executor: DbExecutor,
  event: NotificationEventInput,
): Promise<void> {
  await executor
    .insert(notificationEvents)
    .values({
      eventType: event.eventType,
      subjectType: event.subjectType,
      subjectId: event.subjectId,
    })
    .onConflictDoNothing({
      target: [
        notificationEvents.eventType,
        notificationEvents.subjectType,
        notificationEvents.subjectId,
      ],
    });
}
