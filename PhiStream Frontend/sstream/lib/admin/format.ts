import type { ApplicationStatus, LeadStatus, NotificationEventStatus } from "./api";

/**
 * Words staff read, not the enum values the database stores. Statuses are
 * named for what happens next in the studio, which is how the team talks
 * about an applicant.
 */

export const applicationStatusLabel: Record<ApplicationStatus, string> = {
  NEW: "New",
  UNDER_REVIEW: "In review",
  ACCEPTED: "Accepted",
  REJECTED: "Declined",
  SCHEDULING_OPEN: "Awaiting booking",
  SCHEDULED: "Call booked",
  COMPLETED: "Call done",
  CONVERTED: "Client",
  WITHDRAWN: "Withdrawn",
  ARCHIVED: "Archived",
  NO_SHOW: "No-show",
};

/**
 * Three tones, chosen by what the status asks of the reader:
 *   attention  -- someone has to act (gold fill, the loudest legal mark)
 *   active     -- moving, nothing to do right now (ink fill)
 *   settled    -- finished either way (outline)
 */
export type StatusTone = "attention" | "active" | "settled";

export const applicationStatusTone: Record<ApplicationStatus, StatusTone> = {
  NEW: "attention",
  UNDER_REVIEW: "attention",
  ACCEPTED: "active",
  SCHEDULING_OPEN: "active",
  SCHEDULED: "active",
  COMPLETED: "settled",
  CONVERTED: "settled",
  REJECTED: "settled",
  WITHDRAWN: "settled",
  ARCHIVED: "settled",
  NO_SHOW: "settled",
};

export const leadStatusLabel: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  CONVERTED: "Client",
  LOST: "Lost",
  ARCHIVED: "Archived",
};

export const leadStatusTone: Record<LeadStatus, StatusTone> = {
  NEW: "attention",
  CONTACTED: "active",
  QUALIFIED: "active",
  CONVERTED: "settled",
  LOST: "settled",
  ARCHIVED: "settled",
};

const eventLabels: Record<string, string> = {
  SUBMITTED: "Application submitted",
  REVIEW_STARTED: "Review started",
  ACCEPTED: "Accepted",
  REJECTED: "Declined",
  SCHEDULING_ENABLED: "Booking link enabled",
  BOOKING_CREATED: "Call booked",
  BOOKING_CANCELLED: "Booking cancelled",
  BOOKING_RESCHEDULED: "Call moved",
  MEETING_COMPLETED: "Call held",
  MEETING_NO_SHOW: "Didn't show",
  SCHEDULING_REOPENED: "Booking reopened",
  CONVERTED: "Became a client",
  WITHDRAWN: "Withdrawn",
  ARCHIVED: "Archived",
};

export function eventLabel(eventType: string) {
  return eventLabels[eventType] ?? eventType.toLowerCase().replaceAll("_", " ");
}

const notificationLabels: Record<string, string> = {
  CONTACT_RECEIVED: "Contact message",
  APPLICATION_SUBMITTED: "New application",
  APPLICATION_ACCEPTED: "Acceptance",
  APPLICATION_REJECTED: "Decline",
  MEETING_BOOKED: "Call booked",
  MEETING_RESCHEDULED: "Call moved",
  MEETING_CANCELLED: "Call cancelled",
  SCHEDULING_BOOKING_NEEDS_ATTENTION: "Booking needs a look",
};

export function notificationLabel(eventType: string) {
  return notificationLabels[eventType] ?? eventType.toLowerCase().replaceAll("_", " ");
}

export const notificationStatusLabel: Record<NotificationEventStatus, string> = {
  PENDING: "Sending",
  PROCESSED: "Sent",
  FAILED: "Failed",
};

export const notificationStatusTone: Record<NotificationEventStatus, StatusTone> = {
  FAILED: "attention",
  PENDING: "active",
  PROCESSED: "settled",
};

const auditLabels: Record<string, string> = {
  "application.review_started": "Started a review",
  "application.accepted": "Accepted an application",
  "application.rejected": "Declined an application",
  "application.note_added": "Added a note",
  "application.scheduling_access_issued": "Created a booking link",
  "notification.requeued": "Retried an email",
  "lead.erased": "Erased a lead",
  "retention.applied": "Deleted old records",
  "staff.added": "Added a staff member",
  "staff.activated": "Reactivated a staff member",
  "staff.deactivated": "Deactivated a staff member",
  "staff.role_changed": "Changed a staff role",
};

export function auditLabel(action: string) {
  return auditLabels[action] ?? action.replaceAll(/[._]/g, " ");
}

const actorLabels = {
  SYSTEM: "Automatically",
  APPLICANT: "By the applicant",
  PROVIDER: "By the booking calendar",
  STAFF: "By staff",
} as const;

export function actorLabel(
  actorType: keyof typeof actorLabels,
  actor: { displayName: string } | null,
) {
  return actor ? `By ${actor.displayName}` : actorLabels[actorType];
}

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

export function formatDateTime(iso: string) {
  return dateTime.format(new Date(iso));
}

/**
 * Short and scannable for lists: "14:05" today, "Yesterday", "3 Oct" this
 * year, the full date beyond that. The exact time is in the title attribute.
 */
export function formatWhen(iso: string, now = new Date()) {
  const date = new Date(iso);
  const days = Math.floor(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000,
  );
  if (days <= 0) return time.format(date);
  if (days === 1) return "Yesterday";
  if (date.getFullYear() === now.getFullYear()) return dayMonth.format(date);
  return dateTime.format(date).split(",")[0];
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * An answer of any question type, as one readable string. Choice answers are
 * stored as option values ("tiktok"); `options` turns them back into the
 * label the applicant actually picked ("TikTok").
 */
export function formatAnswer(
  answer: unknown,
  options?: { value: string; label: string }[],
): string {
  if (answer === null || answer === undefined || answer === "") return "—";
  if (typeof answer === "boolean") return answer ? "Yes" : "No";
  if (Array.isArray(answer)) return answer.map((a) => formatAnswer(a, options)).join(", ");
  if (options && typeof answer === "string") {
    return options.find((o) => o.value === answer)?.label ?? answer;
  }
  if (typeof answer === "object") return JSON.stringify(answer);
  return String(answer);
}

/** "instagram / bio", or null when the visitor arrived without a campaign tag. */
export function attribution(source: string | null, campaign: string | null) {
  if (!source && !campaign) return null;
  return [source, campaign].filter(Boolean).join(" / ");
}
