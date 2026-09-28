import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import {
  createdAt,
  id,
  lengthBetween,
  oneOf,
  timestamptz,
  updatedAt,
  upperSnake,
} from './columns.js';
import { serviceTiers } from './content.js';
import {
  ACTOR_TYPES,
  APPLICATION_ACCESS_TOKEN_PURPOSES,
  APPLICATION_FORM_STATUSES,
  APPLICATION_STATUSES,
} from './enums.js';
import { leads } from './leads.js';
import { staffUsers } from './staff.js';

/**
 * Eligibility applications (applications module). PRIVATE: none of these
 * tables may be exposed through public endpoints, except the ACTIVE form
 * definition, which is served deliberately so the frontend can render it.
 *
 * Deleting a lead cascades to its applications and their answers, notes,
 * events, access tokens, scheduling sessions, and meetings (retention/deletion
 * requests). Service tiers, staff users, and form versions are RESTRICTed:
 * deactivate/retire them instead.
 */

/**
 * Versioned eligibility form definitions. The questions are business data
 * (never hard-coded); `definition` is validated by
 * src/modules/applications/application-form.ts. At most one version is
 * ACTIVE. Once a version leaves DRAFT, its version and definition can no
 * longer change (database trigger, migration 0003), so stored answers always
 * remain interpretable against the questions that were asked.
 */
export const applicationForms = pgTable(
  'application_forms',
  {
    id: id(),
    version: text('version').notNull(),
    status: text('status', { enum: APPLICATION_FORM_STATUSES }).notNull().default('DRAFT'),
    definition: jsonb('definition').$type<unknown>().notNull(),
    publishedAt: timestamptz('published_at'),
    retiredAt: timestamptz('retired_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('application_forms_version_key').on(t.version),
    uniqueIndex('application_forms_single_active_key')
      .on(t.status)
      .where(sql`status = 'ACTIVE'`),
    check('application_forms_status_valid', oneOf(t.status, APPLICATION_FORM_STATUSES)),
    check(
      'application_forms_version_format',
      sql`${t.version} ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$'`,
    ),
    check('application_forms_definition_is_object', sql`jsonb_typeof(${t.definition}) = 'object'`),
    check(
      'application_forms_published_at_when_published',
      sql`${t.status} = 'DRAFT' or ${t.publishedAt} is not null`,
    ),
  ],
).enableRLS();

export const applications = pgTable(
  'applications',
  {
    id: id(),
    /** Human-friendly public reference. Not an authorization credential. */
    reference: text('reference').notNull(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    serviceTierId: uuid('service_tier_id').references(() => serviceTiers.id, {
      onDelete: 'restrict',
    }),
    formVersion: text('form_version')
      .notNull()
      .references(() => applicationForms.version, { onDelete: 'restrict' }),
    status: text('status', { enum: APPLICATION_STATUSES }).notNull().default('NEW'),
    submittedAt: timestamptz('submitted_at').notNull().defaultNow(),
    reviewedAt: timestamptz('reviewed_at'),
    reviewedBy: uuid('reviewed_by').references(() => staffUsers.id, { onDelete: 'restrict' }),
    rejectionReason: text('rejection_reason'),
    acceptedAt: timestamptz('accepted_at'),
    /**
     * SHA-256 over the normalized email, form version, tier, and answers. Used
     * only to detect accidental resubmission; null for rows not created by
     * the public endpoint.
     */
    submissionFingerprint: text('submission_fingerprint'),
    /**
     * Attribution of THIS application (e.g. utm_source/utm_campaign at
     * submission). The lead keeps its first touch; these record the touch that
     * produced the application, for funnel analytics.
     */
    source: text('source'),
    campaign: text('campaign'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('applications_reference_key').on(t.reference),
    index('applications_status_created_at_idx').on(t.status, t.createdAt),
    index('applications_created_at_idx').on(t.createdAt),
    index('applications_lead_id_idx').on(t.leadId),
    index('applications_service_tier_id_idx').on(t.serviceTierId),
    index('applications_reviewed_by_idx').on(t.reviewedBy),
    index('applications_form_version_idx').on(t.formVersion),
    // Funnel cohorts: applications submitted in a period, optionally by source.
    index('applications_submitted_at_idx').on(t.submittedAt),
    index('applications_source_submitted_at_idx').on(t.source, t.submittedAt),
    index('applications_submission_fingerprint_idx')
      .on(t.submissionFingerprint, t.createdAt)
      .where(sql`submission_fingerprint is not null`),
    check('applications_status_valid', oneOf(t.status, APPLICATION_STATUSES)),
    check('applications_source_length', lengthBetween(t.source, 1, 100)),
    check('applications_campaign_length', lengthBetween(t.campaign, 1, 100)),
    check('applications_reference_length', lengthBetween(t.reference, 4, 64)),
    check('applications_form_version_length', lengthBetween(t.formVersion, 1, 50)),
    check('applications_rejection_reason_length', lengthBetween(t.rejectionReason, 1, 5000)),
    // A rejected application keeps its reason when it is later archived.
    check(
      'applications_rejection_reason_only_when_rejected',
      sql`${t.rejectionReason} is null or ${t.status} in ('REJECTED', 'ARCHIVED')`,
    ),
    check(
      'applications_submission_fingerprint_format',
      sql`${t.submissionFingerprint} is null or ${t.submissionFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
).enableRLS();

/**
 * Bearer tokens that let an applicant read their own application's public
 * status. Only a SHA-256 hash of the 256-bit random token is stored; the raw
 * token is returned once, at submission. Tokens expire and can be revoked.
 */
export const applicationAccessTokens = pgTable(
  'application_access_tokens',
  {
    id: id(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    purpose: text('purpose', { enum: APPLICATION_ACCESS_TOKEN_PURPOSES }).notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
    revokedAt: timestamptz('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('application_access_tokens_token_hash_key').on(t.tokenHash),
    index('application_access_tokens_application_id_idx').on(t.applicationId),
    index('application_access_tokens_expires_at_idx').on(t.expiresAt),
    check(
      'application_access_tokens_purpose_valid',
      oneOf(t.purpose, APPLICATION_ACCESS_TOKEN_PURPOSES),
    ),
    check('application_access_tokens_token_hash_format', sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
  ],
).enableRLS();

/**
 * One row per answered question. Questions are identified by key and the
 * application's `form_version`, so the eligibility form can change without
 * schema migrations.
 */
export const applicationAnswers = pgTable(
  'application_answers',
  {
    id: id(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    questionKey: text('question_key').notNull(),
    answer: jsonb('answer').$type<unknown>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    // Also serves lookups by application_id (leading column).
    uniqueIndex('application_answers_application_question_key').on(t.applicationId, t.questionKey),
    check('application_answers_question_key_format', sql`${t.questionKey} ~ '^[a-z][a-z0-9_]*$'`),
    check('application_answers_question_key_length', lengthBetween(t.questionKey, 1, 100)),
  ],
).enableRLS();

/** Internal staff notes. Never returned by public endpoints. */
export const applicationNotes = pgTable(
  'application_notes',
  {
    id: id(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => staffUsers.id, { onDelete: 'restrict' }),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('application_notes_application_id_created_at_idx').on(t.applicationId, t.createdAt),
    index('application_notes_author_id_idx').on(t.authorId),
    check('application_notes_body_length', lengthBetween(t.body, 1, 10_000)),
  ],
).enableRLS();

/**
 * Business audit trail of the application lifecycle (SUBMITTED, ACCEPTED,
 * ...). `event_type` is format-checked; the authoritative list of event types
 * lives in the applications domain module (Phase 4). `actor_id` is polymorphic
 * (staff user, provider, ...) and therefore has no foreign key.
 */
export const applicationEvents = pgTable(
  'application_events',
  {
    id: id(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    actorType: text('actor_type', { enum: ACTOR_TYPES }).notNull(),
    actorId: uuid('actor_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index('application_events_application_id_created_at_idx').on(t.applicationId, t.createdAt),
    check('application_events_event_type_format', upperSnake(t.eventType)),
    check('application_events_actor_type_valid', oneOf(t.actorType, ACTOR_TYPES)),
    check(
      'application_events_metadata_is_object',
      sql`${t.metadata} is null or jsonb_typeof(${t.metadata}) = 'object'`,
    ),
  ],
).enableRLS();
