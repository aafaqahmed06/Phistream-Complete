/**
 * The one place the site talks to the Phistream backend.
 *
 * Every response either resolves to the `data` payload or throws an ApiError
 * built from the backend's error envelope ({ error: { code, message,
 * requestId, details? } }), so components switch on `code` rather than on raw
 * status numbers. The base URL already includes the /api/v1 prefix.
 *
 * Server components call this too (the homepage content), so nothing here may
 * touch window at module scope.
 *
 * The browser uses the same-origin path /api/v1, which next.config.ts proxies
 * to the backend. Server rendering has no origin to be relative to, so it
 * calls the backend directly at BACKEND_URL.
 */

export const API_BASE_URL =
  typeof window === "undefined"
    ? `${(process.env.BACKEND_URL ?? "http://127.0.0.1:4000").replace(/\/+$/, "")}/api/v1`
    : "/api/v1";

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export type ApiErrorDetail = {
  location: string;
  /** JSON pointer into the body, e.g. "/email" or "/answers/about_you". */
  path: string;
  message: string;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** Backend ERROR_CODES value, or NETWORK_ERROR when nothing came back. */
    readonly code: string,
    message: string,
    readonly details: ApiErrorDetail[] = [],
    /** Seconds, from Retry-After on a 429. */
    readonly retryAfter: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * The whole response body, for callers that need more than `data` (the admin
 * lists read `pagination` too). Throws ApiError on any non-2xx.
 */
export async function requestBody<B>(
  path: string,
  init: RequestInit = {},
): Promise<B> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...init.headers },
    });
  } catch {
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "We could not reach the server. Check your connection and try again.",
    );
  }

  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const envelope = (body as { error?: Partial<ApiError> } | null)?.error;
    const retryAfter = Number(res.headers.get("retry-after"));
    throw new ApiError(
      res.status,
      envelope?.code ?? "INTERNAL_ERROR",
      envelope?.message ?? "Something went wrong. Please try again.",
      (envelope?.details as ApiErrorDetail[] | undefined) ?? [],
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    );
  }

  return body as B;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await requestBody<{ data: T }>(path, init)).data;
}

function postJson<T>(path: string, payload: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** Field path -> first message, for inline errors. "/answers/x" -> "answers.x". */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  const out: Record<string, string> = {};
  for (const d of error.details) {
    const key = d.path.replace(/^\//, "").replaceAll("/", ".");
    out[key] ??= d.message;
  }
  return out;
}

/** One sentence for a form-level notice, chosen by error code. */
export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Something went wrong. Please try again.";
  }
  switch (error.code) {
    case "VALIDATION_ERROR":
      return "Some details need another look. Check the highlighted fields.";
    case "RATE_LIMITED": {
      const minutes = error.retryAfter
        ? Math.max(1, Math.ceil(error.retryAfter / 60))
        : null;
      return minutes
        ? `Too many attempts from this connection. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
        : "Too many attempts from this connection. Try again a little later.";
    }
    case "VERIFICATION_FAILED":
      return "We could not verify you are human. Please try again.";
    default:
      return error.message;
  }
}

/* -------------------------------------------------------------------------- */
/* Public content                                                             */
/* -------------------------------------------------------------------------- */

export type PublicServiceTier = {
  id: string;
  slug: string;
  name: string;
  description: string;
  /** Minor units (cents) plus ISO 4217 code; null = price not published. */
  price: { amountMinor: number; currency: string } | null;
  billingPeriod: string | null;
  features: string[];
};

export type PublicFaq = { id: string; question: string; answer: string };

export type PublicTestimonial = {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  quote: string;
  avatarUrl: string | null;
};

export type HomeContent = {
  contact: { email: string | null; phone: string | null };
  socialLinks: { label: string; url: string }[];
  services: PublicServiceTier[];
  faqs: PublicFaq[];
  testimonials: PublicTestimonial[];
};

/**
 * For server components. Returns null instead of throwing when the backend is
 * down or slow, so the page falls back to the static copy in lib/content.ts
 * rather than failing to render.
 */
export async function getHomeContent(): Promise<HomeContent | null> {
  try {
    return await request<HomeContent>("/content/home", {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(4000),
    });
  } catch (error) {
    console.warn(
      `[api] /content/home unavailable, using static copy: ${(error as Error).message}`,
    );
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Contact                                                                    */
/* -------------------------------------------------------------------------- */

export type ContactPayload = {
  name: string;
  email: string;
  phone?: string;
  companyName?: string;
  message: string;
  source?: string;
  campaign?: string;
  /** Bound to a hidden input. Real people leave it empty. */
  honeypot?: string;
};

/** Always resolves to RECEIVED on success -- the backend never reveals more. */
export function submitContact(payload: ContactPayload) {
  return postJson<{ status: "RECEIVED" }>("/contact", payload);
}

/* -------------------------------------------------------------------------- */
/* Applications                                                               */
/* -------------------------------------------------------------------------- */

type QuestionBase = {
  key: string;
  label: string;
  description?: string | null;
  required: boolean;
};

export type FormQuestion =
  | (QuestionBase & { type: "text"; multiline?: boolean; maxLength?: number })
  | (QuestionBase & {
      type: "number";
      integer?: boolean;
      min?: number;
      max?: number;
    })
  | (QuestionBase & {
      type: "single_choice";
      options: { value: string; label: string }[];
    })
  | (QuestionBase & {
      type: "multiple_choice";
      options: { value: string; label: string }[];
      minSelections?: number;
      maxSelections?: number;
    })
  | (QuestionBase & { type: "boolean" })
  | (QuestionBase & { type: "url" });

export type ApplicationForm = {
  version: string;
  title: string;
  description: string | null;
  questions: FormQuestion[];
};

export type AnswerValue = string | number | boolean | string[];

export type ApplicationPayload = Omit<ContactPayload, "message"> & {
  formVersion: string;
  serviceTierSlug?: string;
  answers: Record<string, AnswerValue>;
};

export type ApplicationReceipt = {
  application: { id: string; reference: string };
  nextStep: string;
  /** Shown once. Keep in sessionStorage; never put it in a URL. */
  statusAccess: { token: string; expiresAt: string };
};

export type PublicApplicationStatus =
  | "UNDER_REVIEW"
  | "ACCEPTED"
  | "NOT_ACCEPTED"
  | "MEETING_SCHEDULED"
  | "WITHDRAWN"
  | "CLOSED";

/** null when no form is published (applications closed) or the API is down. */
export async function getApplicationForm(): Promise<ApplicationForm | null> {
  try {
    return await request<ApplicationForm>("/applications/form", {
      cache: "no-store",
    });
  } catch {
    return null;
  }
}

export async function getServiceTiers(): Promise<PublicServiceTier[]> {
  try {
    return await request<PublicServiceTier[]>("/content/services?limit=100", {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    return [];
  }
}

export function submitApplication(payload: ApplicationPayload) {
  return postJson<ApplicationReceipt>("/applications", payload);
}

export function getApplicationStatus(id: string, token: string) {
  return request<{
    reference: string;
    status: PublicApplicationStatus;
    submittedAt: string;
  }>(`/applications/${encodeURIComponent(id)}/status`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}
