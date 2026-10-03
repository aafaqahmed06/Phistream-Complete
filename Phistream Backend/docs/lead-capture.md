# Lead capture (contact form)

`POST /api/v1/contact`. The public contract is in [API_SPEC.md](../API_SPEC.md#post-contact). This page covers the internal policy.

Code: `src/modules/leads/` (routes → `contact.service.ts` → `leads.repository.ts`), `src/shared/anti-spam/`, `src/modules/notifications/notification-outbox.ts`.

The lead-matching rules below (`lead-resolution.ts`) and the per-email lock are shared with eligibility applications ([applications.md](applications.md)), so a contact message and an application from the same person land on the same lead.

## Request pipeline

```text
rate limit (per IP, route-specific)
  → body limit (64 KiB) → Zod validation + normalization
  → spam guard: honeypot → link limit → human verification (if configured)
  → transaction, holding an advisory lock on the normalized email:
       duplicate check → per-email cap → find/create lead → insert submission → enqueue event
  → 202 { data: { status: "RECEIVED" } }
```

## Deduplication policy

Emails are normalized by trimming and lowercasing the whole address. Provider-specific rewriting (Gmail dots, `+tags`) is **not** applied: those can be different mailboxes. Leads are matched case-insensitively (`lower(email)`, indexed).

`leads.email` is intentionally not unique (DATA_MODEL.md). Instead, every contact submission for an email runs inside one transaction holding `pg_advisory_xact_lock` on that email. Parallel requests for the same person run one after another, and different emails don't block each other. The lock is transaction-scoped, so it works through the Supabase transaction pooler.

| Situation (per normalized email)                                    | Result                                                                                                    |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Identical message already received in the last **24 h**             | `DUPLICATE`: nothing written (double-clicks, retries, replays)                                            |
| **5** or more submissions in the last **hour**                      | `THROTTLED`: nothing written (limits notification floods from one address across IPs)                     |
| Latest lead is open (`NEW`, `CONTACTED`, `QUALIFIED`)               | Submission attached to it. Blank lead fields filled in; stored values never overwritten; status unchanged |
| No lead, or latest lead is closed (`CONVERTED`, `LOST`, `ARCHIVED`) | New `NEW` lead, so a returning contact reaches the new-lead queue                                         |

**Why the lead is never overwritten:** the endpoint is unauthenticated and anyone can type anyone's email. A public request may add information to a lead (phone, company, first-touch `source`/`campaign`) but can't change what staff already have. Each `contact_submissions` row stores the name/phone/company exactly as submitted, so nothing is lost.

**Attribution:** `leads.source`/`campaign` keep the first touch. Every submission records its own `source`/`campaign`.

The windows and cap are `DEFAULT_CONTACT_POLICY` in `contact.service.ts`.

## Anti-spam architecture

Domain code depends only on the `SpamGuard` interface (`src/shared/anti-spam/spam-guard.ts`). A guard runs `SpamCheck`s in order. The first non-`accept` verdict wins:

| Verdict   | Meaning                                  | HTTP result                              |
| --------- | ---------------------------------------- | ---------------------------------------- |
| `accept`  | Process normally                         | `202`                                    |
| `discard` | Almost certainly a bot; dropped silently | `202` (identical, so bots learn nothing) |
| `reject`  | A human may have failed a challenge      | `400 VERIFICATION_FAILED`                |

Checks in the public-form guard (`createPublicFormSpamGuard`):

1. **Honeypot**: a non-empty `honeypot` field → `discard`.
2. **Link limit**: more than 5 `http(s)://`/`www.` links in the message → `discard`.
3. **Human verification**: only when a `HumanVerifier` is wired. Missing or invalid token → `reject`. If the provider is unreachable, the check **fails open** and logs a warning: losing real leads during a provider outage costs more than some spam, and the other layers still apply.

Rate limiting (per IP, `CONTACT_RATE_LIMIT_*`) runs before all of these and also counts invalid requests.

### Adding a CAPTCHA provider

No provider has been chosen yet. To add one (Turnstile, hCaptcha, reCAPTCHA, …):

1. Implement `HumanVerifier` (`src/shared/anti-spam/human-verifier.ts`) in `src/providers/human-verification/<provider>.ts`. `verify()` resolves `{ success: false }` for bad tokens and throws only when the provider is unreachable. Check the widget's `action` and hostname where the provider supports it.
2. Add its secret to `src/config/env.ts` and `.env.example`, never to the frontend.
3. Pass it as `humanVerifier` to `buildApp` in `src/server.ts`.

No domain code changes.

## Notification event (outbox)

Each recorded submission inserts one `notification_events` row (`CONTACT_RECEIVED`, subject `contact_submission`/<id>, `PENDING`) **in the same transaction**. The event exists if and only if the submission committed. The row carries no personal data: the Phase 7 worker loads the submission by id, sends the email through `EmailProvider`, and records `notification_deliveries`. A `(event_type, subject_type, subject_id)` unique index makes enqueueing idempotent. If the subject was deleted in the meantime (retention request), the worker should mark the event processed and skip it.

No email is sent yet. That is Phase 7.

## Logging

- The service logs only the outcome and ids (`outcome`, `leadId`, `submissionId`, `leadCreated`, or a spam `reason`). It never logs names, emails, phones, companies or messages.
- Request logs record method, path and status only (Phase 0).
- The `err` serializer (`src/shared/logging/error-serializer.ts`) removes drizzle's `params` (which appear in both its message and stack) and node-postgres' `detail`/`where`, which would otherwise copy the submitted row into the log whenever the database rejects an insert.

Tests: `tests/unit/contact-service.test.ts`, `tests/unit/anti-spam.test.ts`, `tests/unit/error-serializer.test.ts`, `tests/integration/contact-routes.test.ts`, `tests/db/contact.test.ts`.
