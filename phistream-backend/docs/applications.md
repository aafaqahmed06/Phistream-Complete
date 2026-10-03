# Eligibility applications

The public contract is in [API_SPEC.md](../API_SPEC.md#applications). This page covers the internal design.

Code: `src/modules/applications/`

| File                                     | Role                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `application-form.ts`                    | Form definition schema; builds the answers validator for a version         |
| `application-status.ts`                  | State machine (transitions, event types, actors) and public status mapping |
| `application-lifecycle.ts`               | Executes transitions under a row lock; writes lifecycle events             |
| `application-identifiers.ts`             | Reference generator, submission fingerprint                                |
| `applications.service.ts`                | Submission and status lookup (framework-free)                              |
| `applications.repository.ts`             | Drizzle queries                                                            |
| `application-forms.repository.ts`        | Publishing a form version                                                  |
| `applications.routes.ts` / `.schemas.ts` | HTTP layer                                                                 |

Lead resolution is shared with the contact form: `src/modules/leads/lead-resolution.ts`.

## Form versioning

The real eligibility questions have not been supplied yet, and none are in the code. They are data:

- `application_forms` holds one row per **version**: `DRAFT` → `ACTIVE` → `RETIRED`. At most one version is `ACTIVE` (partial unique index). Only the ACTIVE version is served and accepted.
- Once a version leaves `DRAFT`, its `version` and `definition` are **immutable**, and it can't go back to `DRAFT`. A database trigger enforces this (migration 0003). To change a question, publish a new version.
- `applications.form_version` is a foreign key to `application_forms.version`. Each application records which questions it answered, and answers stay interpretable after the form changes.
- Answers are stored one row per question in `application_answers` (`question_key`, `answer` JSONB), so changing the questions never needs a schema migration.

### Definition format

```json
{
  "title": "Apply to work with us",
  "description": "Optional intro text",
  "questions": [
    {
      "key": "about_you",
      "type": "text",
      "label": "Tell us about you",
      "multiline": true,
      "maxLength": 2000
    },
    {
      "key": "audience_size",
      "type": "number",
      "label": "Followers",
      "integer": true,
      "min": 0,
      "required": false
    },
    {
      "key": "platform",
      "type": "single_choice",
      "label": "Main platform",
      "options": [
        { "value": "instagram", "label": "Instagram" },
        { "value": "tiktok", "label": "TikTok" }
      ]
    },
    {
      "key": "goals",
      "type": "multiple_choice",
      "label": "Goals",
      "maxSelections": 2,
      "options": [
        { "value": "growth", "label": "Growth" },
        { "value": "brand", "label": "Brand" },
        { "value": "sales", "label": "Sales" }
      ]
    },
    { "key": "portfolio", "type": "url", "label": "Link to your work", "required": false },
    { "key": "agree_terms", "type": "boolean", "label": "I agree to be contacted" }
  ]
}
```

Rules: 1–50 questions; `key` lowercase snake_case (≤ 64) and unique; `required` defaults to `true`; option `value`s lowercase and unique (2–50 options); text `maxLength` ≤ 5000 (default 500); `min ≤ max`; `maxSelections ≤` number of options. Invalid definitions are refused at publish time. If a stored ACTIVE definition is ever invalid, it is neither served nor accepted, and an error is logged with the version only.

### Publishing a version

```bash
npm run forms:publish -- 2026-01 path/to/form.json          # development (loads .env)
node dist/db/scripts/publish-application-form.js 2026-01 f.json   # production image (forms:publish:prod)
```

This validates the file, retires the current ACTIVE version, and makes the new version ACTIVE, all in one transaction. A version name can't be reused. The local seed publishes a `[DEMO]` form (`demo-v1`) for frontend development. It is not a real question set.

Clients that loaded the previous version get `409 FORM_VERSION_OUTDATED` on submit and should reload the form. (The form endpoint is cacheable for `CONTENT_CACHE_MAX_AGE_SECONDS`.)

## Submission

In order (`applications.service.ts`):

1. **Spam guard**: honeypot and human verification, same as the contact form ([lead-capture.md](lead-capture.md#anti-spam-architecture)). Answers are **not** link-screened, because creators legitimately include profile and portfolio links. A honeypot hit gets a plausible `201` with a random id, reference and token, but nothing is stored.
2. **Form version** must be the ACTIVE one (`409 FORM_VERSION_OUTDATED`; `503` if none is published).
3. **Answers** are validated against that version: known keys only, required questions answered, each value checked by type (`400`, paths `/answers/<key>`).
4. **Service tier**, if given, must be active (`400`, same error for unknown and inactive).
5. In one transaction holding the **per-email advisory lock** (the same lock as the contact form, so the two flows can't create duplicate leads for one person):
   - **Duplicate check**: the same fingerprint within **1 hour** gets `409 DUPLICATE_SUBMISSION`. The fingerprint is SHA-256 over email, form version, tier and answers (key order and multiple-choice order ignored; name/phone excluded, so fixing a typo is still a duplicate).
   - **Per-email cap**: 3 or more applications for this email in **24 hours** gets `429 RATE_LIMITED`.
   - **Lead**: the latest open lead for the email is reused (blank fields filled, never overwritten), otherwise a new lead is created. See [lead-capture.md](lead-capture.md#deduplication-policy).
   - Insert the application (`NEW`, random `PHI-YYYY-XXXXXX` reference, retried on the rare collision), the answers, a `SUBMITTED` lifecycle event (actor `APPLICANT`), the hashed status token, and an `APPLICATION_SUBMITTED` notification-outbox event.

Several applications per lead are allowed (DATA_MODEL.md). Reviewers will see them together in Phase 5.

**Why the duplicate/cap responses are acceptable for privacy:** they reveal something only to a caller who already knows the email _and_ the exact answers (duplicate), or who has just flooded that address themselves (cap). A legitimate applicant's single application can't be detected. Every other outcome looks the same to the caller.

## Status access (proof of possession)

- On submission the server generates a 256-bit random token (base64url, 43 chars). The response returns it **once**, and the database stores only its **SHA-256 hash** (`application_access_tokens`, purpose `STATUS`, `expires_at`, `revoked_at`). A plain hash is enough for uniformly random 256-bit tokens, and a database leak exposes no usable tokens.
- `GET /applications/:id/status` needs `Authorization: Bearer <token>`. A single query matches hash, application id, purpose, not revoked and not expired, so an unknown id, wrong token, another application's token, and an expired or revoked token all get the same `404`. The UUID alone grants nothing.
- Tokens expire after `APPLICATION_STATUS_TOKEN_TTL_HOURS` (default 168 = 7 days). Phase 7 can email a fresh status link, which proves ownership of the email, by inserting a new token row.
- The response is a coarse public status only:

| Internal                           | Public              |
| ---------------------------------- | ------------------- |
| NEW, UNDER_REVIEW                  | `UNDER_REVIEW`      |
| ACCEPTED, SCHEDULING_OPEN, NO_SHOW | `ACCEPTED`          |
| SCHEDULED                          | `MEETING_SCHEDULED` |
| REJECTED                           | `NOT_ACCEPTED`      |
| WITHDRAWN                          | `WITHDRAWN`         |
| COMPLETED, CONVERTED, ARCHIVED     | `CLOSED`            |

## State machine

Defined in `application-status.ts`. The only allowed moves are listed below; there is no generic "set status" operation.

| From                                                    | To              | Event               | Actors           |
| ------------------------------------------------------- | --------------- | ------------------- | ---------------- |
| NEW                                                     | UNDER_REVIEW    | REVIEW_STARTED      | STAFF            |
| UNDER_REVIEW                                            | ACCEPTED        | ACCEPTED            | STAFF            |
| UNDER_REVIEW                                            | REJECTED        | REJECTED            | STAFF            |
| ACCEPTED                                                | SCHEDULING_OPEN | SCHEDULING_ENABLED  | SYSTEM, STAFF    |
| SCHEDULING_OPEN                                         | SCHEDULED       | BOOKING_CREATED     | PROVIDER, STAFF  |
| SCHEDULED                                               | SCHEDULING_OPEN | BOOKING_CANCELLED   | PROVIDER, STAFF  |
| SCHEDULED                                               | COMPLETED       | MEETING_COMPLETED   | STAFF            |
| SCHEDULED                                               | NO_SHOW         | MEETING_NO_SHOW     | STAFF            |
| NO_SHOW                                                 | SCHEDULING_OPEN | SCHEDULING_REOPENED | STAFF            |
| COMPLETED                                               | CONVERTED       | CONVERTED           | STAFF            |
| NEW, UNDER_REVIEW, ACCEPTED, SCHEDULING_OPEN, SCHEDULED | WITHDRAWN       | WITHDRAWN           | APPLICANT, STAFF |
| any except ARCHIVED                                     | ARCHIVED        | ARCHIVED            | STAFF            |

`ARCHIVED` is terminal. Self-transitions are never allowed. Decisions are final: there is no REJECTED → ACCEPTED or ACCEPTED → REJECTED.

`createApplicationLifecycle().transition()` is the only way status changes after submission. In one transaction it locks the row (`SELECT … FOR UPDATE`), re-checks the move against the current status, updates status and decision fields (`reviewed_at`/`reviewed_by` on accept/reject, `accepted_at`, optional `rejection_reason`), and appends an `application_events` row with `{from, to}` metadata. Error handling:

- invalid move → `409 CONFLICT`
- disallowed actor → `403 FORBIDDEN`
- unknown application → `404`

Racing requests are applied one at a time; the loser gets `409`.

Scheduling (Phase 6, [scheduling.md](scheduling.md)) drives the PROVIDER transitions from signed webhooks: SCHEDULING_OPEN → SCHEDULED (`BOOKING_CREATED`) and SCHEDULED → SCHEDULING_OPEN (`BOOKING_CANCELLED`). A reschedule is recorded as a `BOOKING_RESCHEDULED` event without a status change.

The staff review actions (`application-review.service.ts`, [admin.md](admin.md#review-actions-and-transactions)) use the same step function (`applyTransition`) inside one locked transaction together with the audit entry and outbox event. **Accept** performs two steps: `ACCEPTED` (STAFF), then `SCHEDULING_OPEN` (SYSTEM, `SCHEDULING_ENABLED`). Acceptance therefore makes the applicant eligible to schedule immediately; Phase 6 issues the provider access.

## Security checklist

- Unauthenticated endpoints never return answers, notes, rejection reasons, reviewer ids, internal statuses or lead data. Response schemas strip anything else.
- UUIDs are not authorization; status needs the bearer token.
- Tokens are never logged (request logs record method, path and status only) and never accepted in URLs.
- Service logs contain ids and outcomes only, never contact details or answers.
- Submissions are rate-limited per IP (`APPLICATION_RATE_LIMIT_*`) and capped per email.

## Decisions for the business

- The actual questions, and the first real form version.
- Whether `REJECTED` should show as `NOT_ACCEPTED` on the status endpoint straight away, or only after the rejection email has been sent (Phase 7).
- Whether a rejection reason is required. It is optional now and never shown to applicants.
- Duplicate window (1 h), per-email cap (3 per 24 h), token lifetime (7 days).
- Whether REJECTED → UNDER_REVIEW (reconsideration) or NEW → REJECTED (quick spam rejection) should be allowed. Both are currently disallowed.
