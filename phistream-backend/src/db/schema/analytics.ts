import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { applications } from './applications.js';
import { createdAt, id, lengthBetween, oneOf } from './columns.js';
import { ANALYTICS_EVENT_NAMES } from './enums.js';

/**
 * Anonymous funnel events (analytics module). Deliberately minimal: no IP
 * addresses, no user agents, no personal data in `metadata`. The link to an
 * application is cleared if the application is deleted.
 */
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: id(),
    eventName: text('event_name', { enum: ANALYTICS_EVENT_NAMES }).notNull(),
    anonymousSessionId: text('anonymous_session_id').notNull(),
    applicationId: uuid('application_id').references(() => applications.id, {
      onDelete: 'set null',
    }),
    source: text('source'),
    campaign: text('campaign'),
    path: text('path'),
    referrer: text('referrer'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index('analytics_events_event_name_created_at_idx').on(t.eventName, t.createdAt),
    index('analytics_events_created_at_idx').on(t.createdAt),
    index('analytics_events_application_id_idx')
      .on(t.applicationId)
      .where(sql`application_id is not null`),
    check('analytics_events_event_name_valid', oneOf(t.eventName, ANALYTICS_EVENT_NAMES)),
    check(
      'analytics_events_anonymous_session_id_length',
      lengthBetween(t.anonymousSessionId, 8, 128),
    ),
    check('analytics_events_source_length', lengthBetween(t.source, 1, 100)),
    check('analytics_events_campaign_length', lengthBetween(t.campaign, 1, 100)),
    check('analytics_events_path_length', lengthBetween(t.path, 1, 2048)),
    check('analytics_events_referrer_length', lengthBetween(t.referrer, 1, 2048)),
    check(
      'analytics_events_metadata_is_object',
      sql`${t.metadata} is null or jsonb_typeof(${t.metadata}) = 'object'`,
    ),
  ],
).enableRLS();
