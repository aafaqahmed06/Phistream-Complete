import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import {
  createdAt,
  id,
  lengthBetween,
  oneOf,
  timestamptz,
  updatedAt,
  upperSnake,
} from './columns.js';
import { NOTIFICATION_EVENT_STATUSES, NOTIFICATION_STATUSES } from './enums.js';

/**
 * Transactional outbox of internal notification events (notifications
 * module). PRIVATE.
 *
 * Domain code inserts an event in the same transaction as the state change it
 * describes, so an event exists if and only if the change committed. The
 * notification dispatcher turns events into `notification_deliveries`.
 *
 * Events reference their subject by type + id and carry no payload, so no
 * personal data is copied here. `subject_id` is polymorphic and has no foreign
 * key: if the subject is deleted (retention request), the worker skips it.
 *
 * Worker protocol (src/modules/notifications/dispatcher.ts): an event is due
 * when PENDING, `next_attempt_at` has passed and it is not leased
 * (`locked_until` null or past). Claiming sets a short lease and increments
 * `attempts`; failures reschedule with backoff; after the maximum number of
 * attempts (or a permanent error) the event becomes FAILED (dead letter).
 */
export const notificationEvents = pgTable(
  'notification_events',
  {
    id: id(),
    eventType: text('event_type').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    status: text('status', { enum: NOTIFICATION_EVENT_STATUSES }).notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    nextAttemptAt: timestamptz('next_attempt_at').notNull().defaultNow(),
    /** Lease held by the worker processing the event; null when idle. */
    lockedUntil: timestamptz('locked_until'),
    processedAt: timestamptz('processed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // One event of each type per subject: enqueueing is idempotent.
    uniqueIndex('notification_events_subject_key').on(t.eventType, t.subjectType, t.subjectId),
    // Worker queue scan: due pending events, earliest schedule first.
    index('notification_events_status_next_attempt_idx').on(t.status, t.nextAttemptAt),
    index('notification_events_status_created_at_idx').on(t.status, t.createdAt),
    check('notification_events_status_valid', oneOf(t.status, NOTIFICATION_EVENT_STATUSES)),
    check('notification_events_event_type_format', upperSnake(t.eventType)),
    check('notification_events_subject_type_format', sql`${t.subjectType} ~ '^[a-z][a-z0-9_]*$'`),
    check('notification_events_attempts_non_negative', sql`${t.attempts} >= 0`),
    check('notification_events_last_error_length', lengthBetween(t.lastError, 1, 2000)),
    check(
      'notification_events_processed_at_when_processed',
      sql`${t.status} <> 'PROCESSED' or ${t.processedAt} is not null`,
    ),
  ],
).enableRLS();

/**
 * Outbound email delivery tracking (notifications module). PRIVATE: contains
 * recipient addresses. Email bodies are intentionally not stored.
 *
 * One row per (event, template, recipient): the unique key makes sending
 * idempotent across retries and worker restarts, and the row id is passed to
 * the provider as its idempotency key. `last_error` holds a sanitized error
 * code, never provider messages (which can echo addresses).
 */
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: id(),
    notificationEventId: uuid('notification_event_id')
      .notNull()
      .references(() => notificationEvents.id, { onDelete: 'cascade' }),
    /** Template id, e.g. "staff.application_submitted". */
    template: text('template').notNull(),
    eventType: text('event_type').notNull(),
    recipient: text('recipient').notNull(),
    provider: text('provider').notNull(),
    providerMessageId: text('provider_message_id'),
    status: text('status', { enum: NOTIFICATION_STATUSES }).notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    sentAt: timestamptz('sent_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('notification_deliveries_event_template_recipient_key').on(
      t.notificationEventId,
      t.template,
      t.recipient,
    ),
    index('notification_deliveries_status_created_at_idx').on(t.status, t.createdAt),
    index('notification_deliveries_created_at_idx').on(t.createdAt),
    uniqueIndex('notification_deliveries_provider_message_key')
      .on(t.provider, t.providerMessageId)
      .where(sql`provider_message_id is not null`),
    check('notification_deliveries_status_valid', oneOf(t.status, NOTIFICATION_STATUSES)),
    check('notification_deliveries_event_type_format', upperSnake(t.eventType)),
    check('notification_deliveries_template_format', sql`${t.template} ~ '^[a-z][a-z0-9_.]*$'`),
    check('notification_deliveries_provider_format', sql`${t.provider} ~ '^[a-z][a-z0-9_-]*$'`),
    check('notification_deliveries_recipient_length', lengthBetween(t.recipient, 3, 320)),
    check('notification_deliveries_attempts_non_negative', sql`${t.attempts} >= 0`),
    check('notification_deliveries_last_error_length', lengthBetween(t.lastError, 1, 2000)),
    check(
      'notification_deliveries_sent_at_when_sent',
      sql`${t.status} <> 'SENT' or ${t.sentAt} is not null`,
    ),
  ],
).enableRLS();
