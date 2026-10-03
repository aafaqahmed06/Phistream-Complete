# Phistream Studio API Specification

Base path:

```text
/api/v1
```

All responses use JSON.

## Error envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The submitted data is invalid.",
    "requestId": "..."
  }
}
```

Never return stack traces in production.

Validation errors (`400 VALIDATION_ERROR`) also include a `details` array. Each entry gives the location and field path of a problem. Submitted values are never echoed back:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The submitted data is invalid.",
    "requestId": "...",
    "details": [{ "location": "body", "path": "/email", "message": "Invalid email address" }]
  }
}
```

Every response carries an `x-request-id` header matching `error.requestId`, plus security headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Cross-Origin-Resource-Policy: same-origin`, `Content-Security-Policy: default-src 'none'`; `Strict-Transport-Security` in production).

---

# Health

## GET /health

## GET /api/v1/health

Liveness check. Not rate-limited and not authenticated. The root path is meant for load balancers and container health checks.

```json
{ "status": "ok", "timestamp": "2026-01-01T00:00:00.000Z" }
```

## GET /health/ready

## GET /api/v1/health/ready

Readiness check: verifies database connectivity. Not rate-limited. Returns `503 SERVICE_UNAVAILABLE` (standard error envelope) when the database is unreachable.

```json
{ "status": "ok", "checks": { "database": "ok" }, "timestamp": "2026-01-01T00:00:00.000Z" }
```

---

# Public Content

Implemented in Phase 2 (`src/modules/content`). Unauthenticated, read-only, rate-limited like every route.

**Visibility:** only rows with `is_active = true` (services, FAQs, testimonials) are returned. Site configuration is returned only when its key is on the typed allow-list (`src/modules/content/site-config.registry.ts`), the row has `is_public = true`, **and** the stored value passes validation. Invalid values are omitted (returned as `null`/`[]`) and logged by key only. Internal columns (`is_active`, `display_order`, timestamps, …) are never part of a response.

**Response shapes:**

- Single resource or aggregate: `{ "data": { … } }`
- List: `{ "data": [ … ], "pagination": { "limit": 20, "offset": 0, "total": 2 } }`

**Pagination** (lists): `?limit=` 1–100 (default 20), `?offset=` 0–10000 (default 0). Items are ordered by `display_order`, then `id`. Invalid values → `400 VALIDATION_ERROR`.

**Caching:** `200` responses send `Cache-Control: public, max-age=60, stale-while-revalidate=300` (`CONTENT_CACHE_MAX_AGE_SECONDS`; `0` → `no-cache`). Error responses are not marked cacheable.

**Types:**

```ts
type PublicServiceTier = {
  id: string; // UUID
  slug: string;
  name: string;
  description: string;
  price: { amountMinor: number; currency: string } | null; // minor units (e.g. cents), ISO 4217; null = not published
  billingPeriod: string | null;
  features: string[];
};
type PublicFaq = { id: string; question: string; answer: string };
type PublicTestimonial = {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  quote: string;
  avatarUrl: string | null;
};
```

## GET /content/home

Aggregate for the homepage: public contact details, social links, and the first page of each list (all active services up to 100; first 20 FAQs and testimonials — use the list endpoints for more).

```json
{
  "data": {
    "contact": { "email": "hello@example.com", "phone": null },
    "socialLinks": [{ "label": "…", "url": "https://…" }],
    "services": [PublicServiceTier],
    "faqs": [PublicFaq],
    "testimonials": [PublicTestimonial]
  }
}
```

Config keys: `contact.email`, `contact.phone`, `social.links`.

## GET /content/services

Active service tiers ordered by `display_order`. Paginated list of `PublicServiceTier`.

## GET /content/services/:slug

One active service tier: `{ "data": PublicServiceTier }`.

- `slug` must match `^[a-z0-9]+(-[a-z0-9]+)*$` (max 100) → otherwise `400 VALIDATION_ERROR`.
- Unknown **and inactive** slugs both return the same `404 NOT_FOUND`.

## GET /content/faqs

Active FAQs. Paginated list of `PublicFaq`.

## GET /content/testimonials

Active testimonials. Paginated list of `PublicTestimonial`.

## GET /content/onboarding

Onboarding page configuration (VSL metadata and funnel steps). Does not include eligibility questions or any application rules.

```json
{
  "data": {
    "headline": "…" ,
    "vsl": { "url": "https://…" },
    "steps": [{ "title": "…", "description": "…" }]
  }
}
```

Config keys: `onboarding.headline`, `onboarding.vsl_url` (must be https), `onboarding.steps`. Unset values are `null` / `[]`.

---

# Contact

## POST /contact

Implemented in Phase 3 (`src/modules/leads`). Records a contact message, creates or updates the matching lead, and queues an internal `CONTACT_RECEIVED` notification. Internal policy: [docs/lead-capture.md](docs/lead-capture.md).

Request (`Content-Type: application/json`):

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+92 300 1234567",
  "companyName": "Example",
  "message": "I'd like to discuss...",
  "source": "instagram",
  "campaign": "bio",
  "honeypot": "",
  "verificationToken": "…"
}
```

| Field               | Required | Rules                                                                                                      |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `name`              | yes      | 1–200 chars after trimming; no line breaks or control characters                                          |
| `email`             | yes      | Valid address, ≤ 320 chars. Trimmed and lowercased                                                         |
| `phone`             | no       | ≤ 50 chars; digits, spaces and `+ ( ) . -`; at least 5 digits                                              |
| `companyName`       | no       | 1–200 chars; no line breaks or control characters                                                          |
| `message`           | yes      | 1–5000 chars after trimming; line breaks and tabs allowed, other control characters rejected               |
| `source`/`campaign` | no       | ≤ 100 chars, `^[A-Za-z0-9][A-Za-z0-9 _.+-]*$` (e.g. `utm_source`/`utm_campaign`). Stored lowercase         |
| `honeypot`          | no       | Anti-spam trap: bind to a **visually hidden** input real users never fill (hide with CSS, `tabindex="-1"`, `autocomplete="off"`, `aria-hidden`). Send it empty or omit it |
| `verificationToken` | no\*     | Human-verification (CAPTCHA) token. \*Required only once a verification provider is configured             |

- Optional fields sent as `""` (or whitespace) are treated as absent.
- Unknown fields are rejected with `400 VALIDATION_ERROR`, so typos such as `company` don't silently lose data.
- Body limit: 64 KiB (`413 PAYLOAD_TOO_LARGE` above that).

Responses:

| Status                    | When                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `202`                     | Input is valid. **Always the same body**: `{ "data": { "status": "RECEIVED" } }`, plus `Cache-Control: no-store` |
| `400 VALIDATION_ERROR`    | Invalid input (`details` lists field paths; values are never echoed)                                    |
| `400 VERIFICATION_FAILED` | Only when a verification provider is configured and the token is missing/invalid. Show the challenge again and let the user retry |
| `413`, `415`              | Body too large / not JSON                                                                               |
| `429 RATE_LIMITED`        | Per-IP limit: 5 requests per 10 minutes by default (`CONTACT_RATE_LIMIT_*`). Honour `Retry-After`         |

The `202` response is identical whether the email is new or already known, whether the message was a duplicate or throttled, and whether it was screened out as spam. The caller can never learn whether an email exists. Show the user a generic "thanks, we'll be in touch" message.

---

# Analytics

Implemented in Phase 8 (`src/modules/analytics`). Design, frontend snippet and definitions: [docs/analytics.md](docs/analytics.md).

## POST /analytics/events

Anonymous funnel events from the browser.

```json
{
  "event": "vsl_start",
  "anonymousSessionId": "3f0c9a4e-…",
  "source": "instagram",
  "campaign": "bio",
  "path": "/onboarding",
  "referrer": "https://l.instagram.com/…"
}
```

Allowed `event` values:

- onboarding_view
- vsl_start
- vsl_25
- vsl_50
- vsl_75
- vsl_complete
- application_start
- application_submit
- scheduling_opened

Rules:

- Any other event, including `application_accepted`, `application_rejected` and `meeting_booked`, is rejected (`400`). The backend measures business outcomes itself.
- `anonymousSessionId`: 8–128 chars `[A-Za-z0-9_-]`, a random per-visit id (e.g. `crypto.randomUUID()` in `sessionStorage`). Never an email or a fingerprint.
- `path` is stored **without** query string or fragment. `referrer` is stored as its **origin** only. `source`/`campaign` are lower-cased.
- Unknown fields are rejected, including `metadata`, `applicationId` and `ip`. No IP address, user agent or cookies are stored.
- Accepts `application/json` or `text/plain` JSON (for `navigator.sendBeacon`, no preflight). Body ≤ 4 KiB.
- `202 { "data": { "status": "RECORDED" } }`. Rate-limited per IP (`ANALYTICS_RATE_LIMIT_*`, default 120/min).

---

# Applications

Implemented in Phase 4 (`src/modules/applications`). Internal design (form model, state machine, duplicate policy, publishing forms): [docs/applications.md](docs/applications.md).

## GET /applications/form

The current (ACTIVE) eligibility form, for rendering. The questions are business data managed as versioned records, not code.

```json
{
  "data": {
    "version": "2026-01",
    "title": "…",
    "description": null,
    "questions": [
      { "key": "about_you", "type": "text", "label": "…", "required": true, "multiline": true, "maxLength": 2000 },
      { "key": "platform", "type": "single_choice", "label": "…", "required": true,
        "options": [{ "value": "instagram", "label": "Instagram" }, { "value": "tiktok", "label": "TikTok" }] }
    ]
  }
}
```

| `type`            | Extra fields                                          | Answer value                         |
| ----------------- | ----------------------------------------------------- | ------------------------------------ |
| `text`            | `multiline`, `maxLength`                              | string                               |
| `number`          | `integer`, `min?`, `max?`                             | number                               |
| `single_choice`   | `options[]`                                           | one option `value`                   |
| `multiple_choice` | `options[]`, `minSelections?`, `maxSelections?`       | array of distinct option `value`s    |
| `boolean`         |                                                       | `true` / `false`                     |
| `url`             |                                                       | `http(s)` URL string                 |

Every question also has `key`, `label`, optional `description` and `required`. `404 NOT_FOUND` when no form is published. Cacheable like public content.

## POST /applications

```json
{
  "formVersion": "2026-01",
  "serviceTierSlug": "growth",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+92 300 1234567",
  "companyName": "Example",
  "source": "instagram",
  "campaign": "bio",
  "answers": { "about_you": "…", "platform": "instagram" },
  "honeypot": "",
  "verificationToken": "…"
}
```

- `formVersion` (required): the `version` from `GET /applications/form`.
- `serviceTierSlug` (optional): an **active** service tier. Unknown and inactive tiers are rejected the same way.
- `name`, `email`, `phone`, `companyName`, `source`, `campaign`, `honeypot`, `verificationToken`: same rules as [POST /contact](#post-contact).
- `answers` (required): keyed by question `key`. Unknown keys are rejected. `""`, whitespace-only and `null` mean "not answered". Required questions must be answered.
- Unknown top-level fields are rejected. Body limit: 256 KiB.

Response `201` (`Cache-Control: no-store`):

```json
{
  "data": {
    "application": { "id": "4b0e…", "reference": "PHI-2026-7K3Q9M" },
    "nextStep": "UNDER_REVIEW",
    "statusAccess": { "token": "k3J…(43 chars)", "expiresAt": "2026-01-08T12:00:00.000Z" }
  }
}
```

`statusAccess.token` is a secret shown **only once**. Keep it client-side (e.g. `sessionStorage`) and never put it in a URL. The reference is for humans and is not a credential.

| Status                      | When                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `400 VALIDATION_ERROR`      | Invalid field. Answer problems use paths like `/answers/<key>`; values are never echoed          |
| `400 VERIFICATION_FAILED`   | Human verification failed (only when a provider is configured)                                  |
| `409 FORM_VERSION_OUTDATED` | `formVersion` is not the published version. Reload the form and resubmit                        |
| `409 DUPLICATE_SUBMISSION`  | Same email, form version, tier and answers received within the last hour (double submit)       |
| `429 RATE_LIMITED`          | Per-IP limit (default 5/hour, `APPLICATION_RATE_LIMIT_*`) or more than 3 applications per email in 24 h |
| `503 SERVICE_UNAVAILABLE`   | No form is published (applications closed)                                                      |

## GET /applications/:id/status

Public-safe status for the applicant who holds the status token:

```http
GET /api/v1/applications/4b0e…/status
Authorization: Bearer <statusAccess.token>
```

```json
{ "data": { "reference": "PHI-2026-7K3Q9M", "status": "UNDER_REVIEW", "submittedAt": "2026-01-01T12:00:00.000Z" } }
```

`status` is one of `UNDER_REVIEW`, `ACCEPTED`, `NOT_ACCEPTED`, `MEETING_SCHEDULED`, `WITHDRAWN`, `CLOSED`. It is a coarse public mapping of the internal state. Answers, notes, rejection reasons, reviewers and internal states are never returned.

- `401 UNAUTHORIZED` (with `WWW-Authenticate: Bearer`): header missing or malformed. Tokens in the query string are ignored.
- `404 NOT_FOUND`: unknown id, wrong token, another application's token, expired or revoked token. These cases are **indistinguishable by design**, so ids cannot be enumerated or probed.
- Tokens expire after `APPLICATION_STATUS_TOKEN_TTL_HOURS` (default 7 days). Response: `Cache-Control: no-store`.

---

# Scheduling

Implemented in Phase 6 (`src/modules/scheduling`, provider adapters in `src/providers/scheduling`). Design, Cal.com setup and environment variables: [docs/scheduling.md](docs/scheduling.md).

Only accepted applications awaiting a booking (`SCHEDULING_OPEN`) can receive or use scheduling access. When scheduling is not configured (`SCHEDULING_PROVIDER` unset), these endpoints answer `503`.

## POST /admin/applications/:id/scheduling-access

Staff (ADMIN, REVIEWER), staff bearer token. Issues or re-issues a short-lived scheduling token, invalidating any previous one. Audited.

```json
{ "data": { "token": "k3J…(43 chars)", "expiresAt": "2026-07-04T12:00:00.000Z", "link": "https://phistream.example/schedule#token=k3J…" } }
```

- `201`. The token is shown once; only its hash is stored. `link` is `null` unless `SCHEDULING_PAGE_URL` is set.
- `409 CONFLICT`: the application is not in `SCHEDULING_OPEN`. `404`: unknown application.

## GET /scheduling/session

Public, for the applicant. The token reaches the scheduling page in the URL **fragment** (`#token=…`). The page reads it client-side and sends it in a header:

```http
GET /api/v1/scheduling/session
Authorization: Bearer <scheduling token>
```

```json
{ "data": { "eligible": true, "schedulingUrl": "https://cal.com/…?name=…&email=…&metadata%5BphistreamRef%5D=…", "expiresAt": "…" } }
```

- Open or embed `schedulingUrl`. It is prefilled, and it carries the booking reference that links the booking to the application.
- `401`: header missing or malformed. `404`: unknown, expired, already used (booked), or no-longer-eligible token. **All four look the same**, so arbitrary application ids can't be probed.
- `Cache-Control: no-store`.

> Deviation from the earlier draft (`GET /scheduling/:token`): tokens are never accepted in paths or query strings, because URLs end up in proxy and access logs.

## POST /webhooks/scheduling/:provider

Called by the provider (`calcom`; `mock` in development), never by the frontend.

- The signature is verified over the raw body (Cal.com: `X-Cal-Signature-256`, hex HMAC-SHA256 with `CALCOM_WEBHOOK_SECRET`). Unsigned or incorrectly signed requests get `401`.
- Processing is idempotent: `(provider, provider event id)` is stored in the same transaction as the processing, so duplicates are no-ops. Cal.com sends no event id, so the SHA-256 of the raw body is used.
- Booking created → meeting + application `SCHEDULED`. Rescheduled → previous meeting `RESCHEDULED`, new meeting `SCHEDULED`. Cancelled → meeting `CANCELLED`, application back to `SCHEDULING_OPEN` (may rebook).
- Bookings that can't be linked, or that come from ineligible applications, change nothing and alert staff (outbox `SCHEDULING_BOOKING_NEEDS_ATTENTION`).
- Responses: `200 { "received": true }` (including duplicates and ignored events), `400` unrecognized payload, `404` unknown provider, `5xx` failure (nothing recorded; the provider retries).

## GET /admin/applications/:id/booking

Staff (ADMIN, REVIEWER). The latest meeting plus the provider's live booking state (`providerBooking`, or `null` if the provider no longer has it). `404` when there is no booking. `503` when the provider is unreachable or lookup isn't configured (Cal.com: `CALCOM_API_KEY`).

---

# Admin API

Implemented in Phase 5 (`src/modules/admin`). Setup, provisioning and the security model: [docs/admin.md](docs/admin.md).

**Authentication (every admin route):** `Authorization: Bearer <Supabase Auth access token>` of a provisioned, **active** staff user.

| Status                    | When                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `401 UNAUTHORIZED`        | Missing, malformed, expired or otherwise invalid token (`WWW-Authenticate: Bearer`) |
| `403 FORBIDDEN`           | Valid identity but not active staff, or the role lacks the permission              |
| `503 SERVICE_UNAVAILABLE` | Staff auth not configured, or the identity provider's keys are unreachable        |

**Roles:** ADMIN and REVIEWER can use every endpoint below except `GET /admin/audit-logs`, which is ADMIN only.

**Conventions:** every response has `Cache-Control: no-store`. Lists use `?limit=` (1–100, default 20) and `?offset=` (0–10000) and return `{ "data": [...], "pagination": { "limit", "offset", "total" } }`, newest first. Unknown query parameters are rejected (`400`). Date filters are ISO 8601 date-times **with a timezone** and cover the range `[from, to)`. Any unexpected failure returns the generic `500 INTERNAL_ERROR`; database errors are never exposed.

## GET /admin/leads

Filters: `status` (lead status), `source`, `campaign` (case-insensitive exact match), `createdFrom`, `createdTo`, `search` (2–100 chars, case-insensitive substring of email, name or company; `%` and `_` are matched literally).

Items: `id, email, fullName, phone, companyName, source, campaign, landingPath, status, applicationCount, contactSubmissionCount, createdAt, updatedAt`.

## GET /admin/contact-submissions

Contact-form messages, newest first. Roles: ADMIN, REVIEWER. Filters: `leadId` (UUID; one lead's messages), `createdFrom`, `createdTo`, `search` (2–100 chars, case-insensitive substring of the lead's email, the sender's name, company or the message; `%` and `_` are matched literally).

Items: `id, fullName, phone, companyName, message, source, campaign, createdAt, lead { id, email, status }`. Name, phone and company are as submitted with that message (a known lead's own details are never overwritten by the public form). Messages screened out as spam are not stored.

## DELETE /admin/leads/:id

ADMIN only. **Irreversible** erasure of a lead and everything linked to it (contact messages, applications, answers, notes, events, tokens, scheduling sessions, meetings, related notification records); anonymous analytics rows are unlinked. Audited (`lead.erased`, counts only). `200 { "data": { "id", "erased": true, "removed": { "applications", "contactSubmissions", "notificationEvents" } } }`, `404` if unknown. Provider-held copies (Cal.com, Resend, Supabase Auth) must be erased there.

## GET /admin/applications

Filters: `status` (any internal status), `serviceTierId` (UUID), `source` (the lead's source), `submittedFrom`, `submittedTo`.

Items: `id, reference, status, formVersion, submittedAt, reviewedAt, acceptedAt, serviceTier { id, slug, name } | null, lead { id, fullName, email, source, campaign }`.

## GET /admin/applications/:id

Private. Returns:

- `application`: `status, reference, formVersion, submittedAt, reviewedAt, acceptedAt, rejectionReason, reviewer { id, displayName } | null, createdAt, updatedAt`
- `lead`: full lead record
- `serviceTier`
- `answers`: `[{ questionKey, label, type, answer, options? }]`, labelled with the **form version the applicant answered**; choice questions also carry that version's `options` (`value` → `label`) so readers see the label, not the stored value
- `events`: lifecycle events, oldest first, `{ eventType, actorType, actorId, actor { id, displayName } | null, metadata, createdAt }`
- `notes`: `[{ id, body, author { id, displayName }, createdAt }]`
- `scheduling`: `{ session: { provider, providerReference, expiresAt, usedAt, createdAt } | null, meetings: [...] }` (token hashes are never returned)
- `otherApplications`: the same lead's other applications
- `availableActions`: subset of `review | accept | reject | note` that this staff user may perform **now** (state machine + role), for enabling UI controls. The server enforces the same rules regardless.

`404` for an unknown id.

## POST /admin/applications/:id/review · /accept · /reject

No generic status endpoint exists. Each action is **one transaction** under a row lock: the transition(s), their lifecycle events, the audit log entry and the notification-outbox event are all recorded, or none of them are. Provider calls (email, scheduling) happen later, outside the transaction.

| Action   | Transition                                    | Events                              | Outbox                 |
| -------- | --------------------------------------------- | ----------------------------------- | ---------------------- |
| `review` | NEW → UNDER_REVIEW                            | `REVIEW_STARTED`                    | none                   |
| `accept` | UNDER_REVIEW → ACCEPTED → **SCHEDULING_OPEN** | `ACCEPTED`, `SCHEDULING_ENABLED`    | `APPLICATION_ACCEPTED` |
| `reject` | UNDER_REVIEW → REJECTED                       | `REJECTED`                          | `APPLICATION_REJECTED` |

Accept records the reviewer and `acceptedAt`, and makes the applicant eligible to schedule (state `SCHEDULING_OPEN`). The scheduling provider issues the actual booking access in Phase 6.

Reject takes an optional body `{ "reason": "…" }` (1–5000 chars, internal, never shown to the applicant; the audit log records only whether a reason was given).

Response `200`: `{ "data": { "id": "…", "status": "SCHEDULING_OPEN", "events": ["ACCEPTED", "SCHEDULING_ENABLED"] } }`.

`409 CONFLICT` when the current status doesn't allow the action (e.g. accepting a NEW application, deciding twice, or losing a race with another reviewer). `404` for an unknown id.

## POST /admin/applications/:id/notes

Body `{ "body": "…" }` (1–10000 chars, line breaks allowed). Allowed in any status. `201 { "data": { "id", "createdAt" } }`. Audited by note id only.

## GET /admin/audit-logs

ADMIN only. Filters: `action` (e.g. `application.accepted`, `staff.deactivated`), `entityType` (`application` | `staff_user`), `entityId`, `actorId`, `from`, `to`.

Items: `id, action, entityType, entityId, actor { id, displayName, email, role } | null (null = system/CLI), metadata, createdAt`.

## GET /admin/notifications

ADMIN only. Notification events (the email outbox) with their deliveries, newest first. Filters: `status` (`PENDING` | `PROCESSED` | `FAILED`), `eventType`, pagination.

Items: `id, eventType, subjectType, subjectId, status, attempts, lastError, nextAttemptAt, processedAt, createdAt, deliveries[{ id, template, recipient, provider, status, attempts, lastError, providerMessageId, sentAt }]`. `lastError` is a sanitized code such as `resend_422_validation_error` or `no_staff_recipients`. See [docs/notifications.md](docs/notifications.md).

## POST /admin/notifications/:id/retry

ADMIN only. Requeues a `FAILED` event (attempts reset; deliveries already sent are not re-sent). Audited (`notification.requeued`). `200 { "data": { "id", "status": "PENDING" } }`, `409` if the event is not `FAILED`, `404` if unknown.

## GET /admin/analytics/funnel

ADMIN only. Aggregates only. Query: `from`, `to` (ISO 8601 with timezone; `[from, to)`; default the last 30 days; max 366), `source`, `campaign`.

```json
{
  "data": {
    "period": { "from": "…", "to": "…" },
    "filters": { "source": null, "campaign": null },
    "funnel": { "onboardingViews": 1000, "vslStarts": 720, "vslCompletes": 250, "applicationStarts": 240, "applications": 180, "accepted": 64, "rejected": 96, "meetingsBooked": 51 },
    "conversion": { "vslStartRate": 0.72, "vslCompletionRate": 0.3472, "applicationRate": 0.18, "applicationCompletionRate": 0.75, "acceptanceRate": 0.4, "bookingRate": 0.7969, "overallRate": 0.051 },
    "vslProgress": { "started": 720, "reached25": 600, "reached50": 450, "reached75": 300, "completed": 250 },
    "clientReported": { "applicationSubmits": 185, "schedulingOpened": 55 },
    "bySource": [{ "source": "instagram", "onboardingViews": 800, "vslStarts": 600, "applications": 150, "accepted": 55, "meetingsBooked": 45, "applicationRate": 0.1875 }]
  }
}
```

- **Client stages** (`onboardingViews`, `vslStarts`, `vslCompletes`, `applicationStarts`) count distinct anonymous sessions in the period.
- **Authoritative stages** (`applications`, `accepted`, `rejected`, `meetingsBooked`) are the cohort of applications **submitted** in the period and their outcomes so far, read from application and meeting records. Client events cannot affect them.
- All ratios are calculated by the backend (null when the denominator is 0). `acceptanceRate` = accepted / (accepted + rejected). Ratios between client and authoritative stages are indicative (different units).
- `403` for REVIEWER. Definitions: [docs/analytics.md](docs/analytics.md#the-funnel-get-adminanalyticsfunnel-admin).

---

# Content Admin API

Authenticated staff only.

CRUD:

- `/admin/services`
- `/admin/faqs`
- `/admin/testimonials`
- `/admin/site-config`

All mutations create audit log entries.

Do not allow arbitrary public content fields without validation.
