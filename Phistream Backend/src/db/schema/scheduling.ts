import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { applications } from './applications.js';
import { createdAt, id, lengthBetween, oneOf, timestamptz, updatedAt } from './columns.js';
import { MEETING_STATUSES, SCHEDULING_WEBHOOK_OUTCOMES } from './enums.js';

/** Provider identifiers are lowercase slugs, e.g. "calcom". */
const PROVIDER_FORMAT = "'^[a-z][a-z0-9_-]*$'";

/**
 * Scheduling access for an accepted application (scheduling module). PRIVATE.
 * Only hashes are stored, never the raw access token or booking reference:
 * - `token_hash`: SHA-256 of the applicant's short-lived access token;
 * - `booking_ref_hash`: SHA-256 of the booking reference (itself derived
 *   one-way from the token) that the provider echoes back in webhooks, so a
 *   booking can be linked to this application.
 * Re-issuing access rotates both in place (one row per application).
 */
export const schedulingSessions = pgTable(
  'scheduling_sessions',
  {
    id: id(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash'),
    bookingRefHash: text('booking_ref_hash'),
    expiresAt: timestamptz('expires_at'),
    usedAt: timestamptz('used_at'),
    provider: text('provider').notNull(),
    providerReference: text('provider_reference'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // One session per application; also serves lookups by application_id.
    uniqueIndex('scheduling_sessions_application_id_key').on(t.applicationId),
    uniqueIndex('scheduling_sessions_token_hash_key')
      .on(t.tokenHash)
      .where(sql`token_hash is not null`),
    uniqueIndex('scheduling_sessions_booking_ref_hash_key')
      .on(t.bookingRefHash)
      .where(sql`booking_ref_hash is not null`),
    check(
      'scheduling_sessions_booking_ref_hash_format',
      sql`${t.bookingRefHash} is null or ${t.bookingRefHash} ~ '^[0-9a-f]{64}$'`,
    ),
    index('scheduling_sessions_expires_at_idx').on(t.expiresAt),
    check('scheduling_sessions_provider_format', sql`${t.provider} ~ ${sql.raw(PROVIDER_FORMAT)}`),
    check('scheduling_sessions_token_hash_length', lengthBetween(t.tokenHash, 32, 256)),
    check(
      'scheduling_sessions_token_requires_expiry',
      sql`${t.tokenHash} is null or ${t.expiresAt} is not null`,
    ),
  ],
).enableRLS();

/** Meetings booked through the scheduling provider. PRIVATE. */
export const meetings = pgTable(
  'meetings',
  {
    id: id(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id'),
    startsAt: timestamptz('starts_at').notNull(),
    endsAt: timestamptz('ends_at').notNull(),
    status: text('status', { enum: MEETING_STATUSES }).notNull().default('SCHEDULED'),
    meetingUrl: text('meeting_url'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('meetings_application_id_idx').on(t.applicationId),
    index('meetings_starts_at_idx').on(t.startsAt),
    // Provider event IDs are unique per provider (webhook idempotency).
    uniqueIndex('meetings_provider_event_key')
      .on(t.provider, t.providerEventId)
      .where(sql`provider_event_id is not null`),
    check('meetings_status_valid', oneOf(t.status, MEETING_STATUSES)),
    check('meetings_provider_format', sql`${t.provider} ~ ${sql.raw(PROVIDER_FORMAT)}`),
    check('meetings_ends_after_start', sql`${t.endsAt} > ${t.startsAt}`),
    check('meetings_meeting_url_https', sql`${t.meetingUrl} ~ '^https://'`),
  ],
).enableRLS();

/**
 * Received scheduling-provider webhooks (scheduling module). PRIVATE.
 *
 * Deduplication: the unique (provider, provider_event_id) row is inserted in
 * the same transaction that applies the event, so a redelivered event is a
 * no-op and a failed one (rolled back) is retried by the provider. Providers
 * that send no event id get a SHA-256 of the raw body (identical retries).
 * The payload itself is NOT stored: it carries attendee names and emails.
 */
export const schedulingWebhookEvents = pgTable(
  'scheduling_webhook_events',
  {
    id: id(),
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    /** The provider's own event type, e.g. "BOOKING_CREATED". */
    eventType: text('event_type').notNull(),
    outcome: text('outcome', { enum: SCHEDULING_WEBHOOK_OUTCOMES }),
    /** Provider booking id the event referred to, if any. */
    bookingId: text('booking_id'),
    applicationId: uuid('application_id').references(() => applications.id, {
      onDelete: 'set null',
    }),
    receivedAt: timestamptz('received_at').notNull().defaultNow(),
    processedAt: timestamptz('processed_at'),
  },
  (t) => [
    uniqueIndex('scheduling_webhook_events_provider_event_key').on(t.provider, t.providerEventId),
    index('scheduling_webhook_events_application_id_idx')
      .on(t.applicationId)
      .where(sql`application_id is not null`),
    index('scheduling_webhook_events_received_at_idx').on(t.receivedAt),
    check(
      'scheduling_webhook_events_provider_format',
      sql`${t.provider} ~ ${sql.raw(PROVIDER_FORMAT)}`,
    ),
    check(
      'scheduling_webhook_events_outcome_valid',
      sql`${t.outcome} is null or ${oneOf(t.outcome, SCHEDULING_WEBHOOK_OUTCOMES)}`,
    ),
    check(
      'scheduling_webhook_events_provider_event_id_length',
      lengthBetween(t.providerEventId, 1, 200),
    ),
    check('scheduling_webhook_events_event_type_length', lengthBetween(t.eventType, 1, 100)),
    check('scheduling_webhook_events_booking_id_length', lengthBetween(t.bookingId, 1, 200)),
    check(
      'scheduling_webhook_events_processed_with_outcome',
      sql`(${t.processedAt} is null) = (${t.outcome} is null)`,
    ),
  ],
).enableRLS();
