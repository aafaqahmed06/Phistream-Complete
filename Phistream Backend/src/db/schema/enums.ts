/**
 * Allowed values for constrained text columns.
 *
 * These are stored as TEXT with CHECK constraints rather than PostgreSQL enum
 * types: adding a value is then an ordinary, transactional migration. Changing
 * a list here requires `npm run db:generate` to produce that migration.
 */

/** DATA_MODEL.md › leads. */
export const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'CONVERTED',
  'LOST',
  'ARCHIVED',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/**
 * Leads that are still being worked. A new contact submission is attached to
 * the latest open lead for its email; closed leads (CONVERTED, LOST,
 * ARCHIVED) are left untouched and a new lead is opened instead.
 */
export const OPEN_LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
] as const satisfies readonly LeadStatus[];

/**
 * ARCHITECTURE.md › Application state machine (main path plus operational
 * states). Allowed *transitions* are enforced in the applications domain
 * service, not by the database.
 */
export const APPLICATION_STATUSES = [
  'NEW',
  'UNDER_REVIEW',
  'ACCEPTED',
  'REJECTED',
  'SCHEDULING_OPEN',
  'SCHEDULED',
  'COMPLETED',
  'CONVERTED',
  'WITHDRAWN',
  'ARCHIVED',
  'NO_SHOW',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/**
 * Eligibility form versions: DRAFT (editable, not served), ACTIVE (the one
 * version applicants fill in), RETIRED (kept so older applications stay
 * interpretable). Published definitions are immutable.
 */
export const APPLICATION_FORM_STATUSES = ['DRAFT', 'ACTIVE', 'RETIRED'] as const;
export type ApplicationFormStatus = (typeof APPLICATION_FORM_STATUSES)[number];

/** What an application access token grants. */
export const APPLICATION_ACCESS_TOKEN_PURPOSES = ['STATUS'] as const;
export type ApplicationAccessTokenPurpose = (typeof APPLICATION_ACCESS_TOKEN_PURPOSES)[number];

/** Who caused an application lifecycle event. */
export const ACTOR_TYPES = ['SYSTEM', 'STAFF', 'APPLICANT', 'PROVIDER'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

/** DATA_MODEL.md › meetings. */
export const MEETING_STATUSES = [
  'SCHEDULED',
  'CANCELLED',
  'RESCHEDULED',
  'COMPLETED',
  'NO_SHOW',
] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

/** DATA_MODEL.md › staff_users. */
export const STAFF_ROLES = ['ADMIN', 'REVIEWER'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** What happened to a received scheduling-provider webhook. */
export const SCHEDULING_WEBHOOK_OUTCOMES = [
  /** Changed meetings and/or application state. */
  'PROCESSED',
  /** Verified, but no action needed (e.g. an event type we do not use). */
  'IGNORED',
  /** The booking could not be linked to an application or meeting. */
  'UNMATCHED',
  /** Linked to an application that may not (or no longer) schedule. */
  'NOT_ELIGIBLE',
] as const;
export type SchedulingWebhookOutcome = (typeof SCHEDULING_WEBHOOK_OUTCOMES)[number];

/** Delivery lifecycle of an outbound notification. */
export const NOTIFICATION_STATUSES = ['PENDING', 'SENT', 'FAILED'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/** Processing lifecycle of a notification outbox event. */
export const NOTIFICATION_EVENT_STATUSES = ['PENDING', 'PROCESSED', 'FAILED'] as const;
export type NotificationEventStatus = (typeof NOTIFICATION_EVENT_STATUSES)[number];

/**
 * ARCHITECTURE.md › Analytics. Includes server-derived events
 * (application_accepted, application_rejected, meeting_booked); the public
 * endpoint must only accept the client-reportable subset (API_SPEC.md).
 */
export const ANALYTICS_EVENT_NAMES = [
  'onboarding_view',
  'vsl_start',
  'vsl_25',
  'vsl_50',
  'vsl_75',
  'vsl_complete',
  'application_start',
  'application_submit',
  'application_accepted',
  'application_rejected',
  'scheduling_opened',
  'meeting_booked',
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];
