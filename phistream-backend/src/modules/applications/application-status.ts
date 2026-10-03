import type { ActorType, ApplicationStatus } from '../../db/schema/enums.js';

/**
 * Application state machine (ARCHITECTURE.md › Application state machine).
 *
 *   NEW → UNDER_REVIEW ─┬→ REJECTED
 *                       └→ ACCEPTED → SCHEDULING_OPEN → SCHEDULED → COMPLETED → CONVERTED
 *                                          ↑               │
 *                                          └── cancelled ──┤
 *                                          └── NO_SHOW ←───┘
 *
 * plus WITHDRAWN (applicant or staff, before a decision is final) and
 * ARCHIVED (staff housekeeping from any non-archived state).
 *
 * Every allowed move is listed explicitly with the lifecycle event it records
 * and the actor types that may perform it. Anything not listed is invalid;
 * there is no generic "set status" operation. Self-transitions are never
 * allowed. ARCHIVED is terminal.
 */

/** `application_events.event_type` values. */
export const APPLICATION_EVENT_TYPES = [
  'SUBMITTED',
  'REVIEW_STARTED',
  'ACCEPTED',
  'REJECTED',
  'SCHEDULING_ENABLED',
  'BOOKING_CREATED',
  'BOOKING_CANCELLED',
  /** Meeting moved to a new time; status stays SCHEDULED (not a transition). */
  'BOOKING_RESCHEDULED',
  'MEETING_COMPLETED',
  'MEETING_NO_SHOW',
  'SCHEDULING_REOPENED',
  'CONVERTED',
  'WITHDRAWN',
  'ARCHIVED',
] as const;
export type ApplicationEventType = (typeof APPLICATION_EVENT_TYPES)[number];

export interface TransitionRule {
  readonly to: ApplicationStatus;
  readonly event: ApplicationEventType;
  readonly actors: readonly ActorType[];
}

const withdraw: TransitionRule = {
  to: 'WITHDRAWN',
  event: 'WITHDRAWN',
  actors: ['APPLICANT', 'STAFF'],
};
const archive: TransitionRule = { to: 'ARCHIVED', event: 'ARCHIVED', actors: ['STAFF'] };

export const APPLICATION_TRANSITIONS: Readonly<
  Record<ApplicationStatus, readonly TransitionRule[]>
> = {
  NEW: [{ to: 'UNDER_REVIEW', event: 'REVIEW_STARTED', actors: ['STAFF'] }, withdraw, archive],
  UNDER_REVIEW: [
    { to: 'ACCEPTED', event: 'ACCEPTED', actors: ['STAFF'] },
    { to: 'REJECTED', event: 'REJECTED', actors: ['STAFF'] },
    withdraw,
    archive,
  ],
  ACCEPTED: [
    { to: 'SCHEDULING_OPEN', event: 'SCHEDULING_ENABLED', actors: ['SYSTEM', 'STAFF'] },
    withdraw,
    archive,
  ],
  SCHEDULING_OPEN: [
    { to: 'SCHEDULED', event: 'BOOKING_CREATED', actors: ['PROVIDER', 'STAFF'] },
    withdraw,
    archive,
  ],
  SCHEDULED: [
    { to: 'COMPLETED', event: 'MEETING_COMPLETED', actors: ['STAFF'] },
    { to: 'NO_SHOW', event: 'MEETING_NO_SHOW', actors: ['STAFF'] },
    // Booking cancelled at the provider: the applicant may book again.
    { to: 'SCHEDULING_OPEN', event: 'BOOKING_CANCELLED', actors: ['PROVIDER', 'STAFF'] },
    withdraw,
    archive,
  ],
  NO_SHOW: [{ to: 'SCHEDULING_OPEN', event: 'SCHEDULING_REOPENED', actors: ['STAFF'] }, archive],
  COMPLETED: [{ to: 'CONVERTED', event: 'CONVERTED', actors: ['STAFF'] }, archive],
  REJECTED: [archive],
  WITHDRAWN: [archive],
  CONVERTED: [archive],
  ARCHIVED: [],
};

export type TransitionCheck =
  | { readonly ok: true; readonly rule: TransitionRule }
  | { readonly ok: false; readonly reason: 'NOT_ALLOWED' | 'ACTOR_NOT_ALLOWED' };

export function checkTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
  actor: ActorType,
): TransitionCheck {
  const rule = APPLICATION_TRANSITIONS[from].find((candidate) => candidate.to === to);
  if (!rule) return { ok: false, reason: 'NOT_ALLOWED' };
  if (!rule.actors.includes(actor)) return { ok: false, reason: 'ACTOR_NOT_ALLOWED' };
  return { ok: true, rule };
}

export function isTerminalStatus(status: ApplicationStatus): boolean {
  return APPLICATION_TRANSITIONS[status].length === 0;
}

// ---- Public status ------------------------------------------------------------------

/**
 * What an applicant may see about their own application. Deliberately coarse:
 * internal states (review queue, no-show, conversion, archival) and anything
 * staff-only (notes, reasons, reviewer) are never exposed.
 */
export const PUBLIC_APPLICATION_STATUSES = [
  'UNDER_REVIEW',
  'ACCEPTED',
  'NOT_ACCEPTED',
  'MEETING_SCHEDULED',
  'WITHDRAWN',
  'CLOSED',
] as const;
export type PublicApplicationStatus = (typeof PUBLIC_APPLICATION_STATUSES)[number];

const PUBLIC_STATUS: Readonly<Record<ApplicationStatus, PublicApplicationStatus>> = {
  NEW: 'UNDER_REVIEW',
  UNDER_REVIEW: 'UNDER_REVIEW',
  ACCEPTED: 'ACCEPTED',
  SCHEDULING_OPEN: 'ACCEPTED',
  NO_SHOW: 'ACCEPTED',
  SCHEDULED: 'MEETING_SCHEDULED',
  REJECTED: 'NOT_ACCEPTED',
  WITHDRAWN: 'WITHDRAWN',
  COMPLETED: 'CLOSED',
  CONVERTED: 'CLOSED',
  ARCHIVED: 'CLOSED',
};

export function toPublicStatus(status: ApplicationStatus): PublicApplicationStatus {
  return PUBLIC_STATUS[status];
}
