import { requestBody } from "@/lib/api";

/**
 * The staff-only admin API (backend /api/v1/admin/*). Every call carries the
 * signed-in staff member's Supabase access token; the backend decides whether
 * that person is active staff and what their role allows. Nothing here is
 * cached: this is private data and always read fresh.
 */

export type ApplicationStatus =
  | "NEW"
  | "UNDER_REVIEW"
  | "ACCEPTED"
  | "REJECTED"
  | "SCHEDULING_OPEN"
  | "SCHEDULED"
  | "COMPLETED"
  | "CONVERTED"
  | "WITHDRAWN"
  | "ARCHIVED"
  | "NO_SHOW";

export type LeadStatus =
  | "NEW"
  | "CONTACTED"
  | "QUALIFIED"
  | "CONVERTED"
  | "LOST"
  | "ARCHIVED";

export type Pagination = { limit: number; offset: number; total: number };
export type Page<T> = { data: T[]; pagination: Pagination };

export type AdminLead = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  companyName: string | null;
  source: string | null;
  campaign: string | null;
  landingPath: string | null;
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
};

export type AdminLeadListItem = AdminLead & {
  applicationCount: number;
  contactSubmissionCount: number;
};

export type AdminApplicationListItem = {
  id: string;
  reference: string;
  status: ApplicationStatus;
  formVersion: string;
  submittedAt: string;
  reviewedAt: string | null;
  acceptedAt: string | null;
  serviceTier: { id: string; slug: string; name: string } | null;
  lead: {
    id: string;
    fullName: string;
    email: string;
    source: string | null;
    campaign: string | null;
  };
};

type StaffRef = { id: string; displayName: string };

export type AdminApplicationDetail = {
  application: {
    id: string;
    reference: string;
    status: ApplicationStatus;
    formVersion: string;
    submittedAt: string;
    reviewedAt: string | null;
    acceptedAt: string | null;
    rejectionReason: string | null;
    reviewer: StaffRef | null;
    createdAt: string;
    updatedAt: string;
  };
  lead: AdminLead;
  serviceTier: { id: string; slug: string; name: string } | null;
  answers: {
    questionKey: string;
    label: string | null;
    type: string | null;
    answer: unknown;
    /** Choice questions: the answered form's options, to show labels not values. */
    options?: { value: string; label: string }[];
  }[];
  events: {
    id: string;
    eventType: string;
    actorType: "SYSTEM" | "STAFF" | "APPLICANT" | "PROVIDER";
    actor: StaffRef | null;
    createdAt: string;
  }[];
  notes: { id: string; body: string; author: StaffRef; createdAt: string }[];
  scheduling: {
    session: { provider: string; expiresAt: string | null; usedAt: string | null } | null;
    meetings: {
      id: string;
      provider: string;
      status: string;
      startsAt: string;
      endsAt: string;
      meetingUrl: string | null;
    }[];
  };
  otherApplications: {
    id: string;
    reference: string;
    status: ApplicationStatus;
    submittedAt: string;
  }[];
  /** What this staff member may do now (the backend's state machine + role). */
  availableActions: ("review" | "accept" | "reject" | "schedule" | "note")[];
};

export type SchedulingAccess = {
  token: string;
  expiresAt: string;
  /** SCHEDULING_PAGE_URL#token=…; null when the backend has no page URL set. */
  link: string | null;
};

export type NotificationEventStatus = "PENDING" | "PROCESSED" | "FAILED";

export type AdminNotification = {
  id: string;
  eventType: string;
  subjectType: string;
  subjectId: string;
  status: NotificationEventStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string;
  processedAt: string | null;
  createdAt: string;
  deliveries: {
    id: string;
    template: string;
    recipient: string;
    provider: string;
    status: "PENDING" | "SENT" | "FAILED";
    attempts: number;
    lastError: string | null;
    sentAt: string | null;
  }[];
};

export type AdminAuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: { id: string; displayName: string; email: string; role: string } | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type AdminContactSubmission = {
  id: string;
  fullName: string;
  phone: string | null;
  companyName: string | null;
  message: string;
  source: string | null;
  campaign: string | null;
  createdAt: string;
  lead: { id: string; email: string; status: LeadStatus };
};

export type Funnel = {
  period: { from: string; to: string };
  funnel: {
    onboardingViews: number;
    vslStarts: number;
    vslCompletes: number;
    applicationStarts: number;
    applications: number;
    accepted: number;
    rejected: number;
    meetingsBooked: number;
  };
  conversion: Record<string, number | null>;
  clientReported: { applicationSubmits: number; schedulingOpened: number };
};

/** Builds `?a=1&b=2`, skipping empty values. */
export function query(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function adminGet<B>(path: string, token: string): Promise<B> {
  return requestBody<B>(`/admin${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}

/** State-changing admin calls. Every one is audited by the backend. */
export function adminPost<B>(path: string, token: string, body?: unknown): Promise<B> {
  return requestBody<B>(`/admin${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
}
