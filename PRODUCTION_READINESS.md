# Production readiness

Status after BUILD_PLAN Phases 0–9. API version `1.0.0`. Detailed designs live in `docs/`; the API contract is in [API_SPEC.md](API_SPEC.md) and in the OpenAPI document served at `/docs/json` when enabled.

## What was verified

Every item below is backed by automated tests (1,397 tests; ~92 % statement / 85 % branch coverage). Database behaviour is tested against real PostgreSQL 17 (`npm run test:db`), and CI runs everything plus a production-image smoke test.

| Area                   | Verified                                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication         | Staff only: Supabase JWT verified locally (pinned algorithms, iss/aud/exp, `role=authenticated`, `alg:none` refused); `sub` → **active** `staff_users` row on every request, so deactivation is immediate. No public accounts. |
| Authorization          | One permission table (`src/modules/admin/permissions.ts`), enforced server-side on every admin route; REVIEWER/ADMIN split tested per route. Status and scheduling access need unguessable bearer tokens, never ids alone. |
| CORS                   | Exact-origin allow-list, required in production, no wildcard, no credentials; preflight unauthenticated.                                                              |
| Rate limiting          | Global per-IP limit plus stricter per-route limits (contact 5/10 min, applications 5/h, analytics 120/min, webhooks 600/min); unknown routes limited; per-email caps on public forms. |
| Request limits         | Global 100 KiB body limit, tighter per route (4 KiB–256 KiB); **30 s request timeout** (added in this phase); strict JSON schemas reject unknown fields.               |
| Validation             | Zod on every input (body, params, query); values never echoed in errors; control characters rejected in single-line fields.                                           |
| SQL injection          | All queries parameterized (Drizzle); `sql.raw` only in schema DDL with code-defined constants; LIKE input escaped.                                                     |
| Webhooks               | HMAC-SHA256 over the raw body, constant-time compare, verified before parsing; idempotent by (provider, event id) in the processing transaction; replays are no-ops.  |
| Tokens                 | 256-bit random, only SHA-256 hashes stored, expiring, header-only (never URLs), never logged; staff JWTs never logged.                                                  |
| PII exposure           | Public responses carry no answers, notes, reasons, or internal states; enumeration-safe responses on contact, applications, status, and scheduling; admin views never select token hashes or fingerprints. |
| Logs                   | Method/path/status only; bodies, headers, and query strings never logged; error serializer strips SQL parameters and row details; tested at trace level.              |
| Secrets                | None in the repository (scanned); secrets come from the environment only, are validated without echoing values, and never reach the frontend.                         |
| Error responses        | One envelope; 5xx always generic; database errors never exposed; `x-request-id` on every response.                                                                    |
| Security headers       | **Added in this phase:** nosniff, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, CORP same-origin, CSP `default-src 'none'` (API), HSTS in production.        |
| Database permissions   | RLS enabled on every table with no policies; Supabase `anon`/`authenticated` privileges revoked on tables, sequences, and **functions (migration 0007, added in this phase)**. |
| Indexes                | Every foreign key indexed (tested); unique keys for idempotency; indexes for queue scans, token lookups, funnel cohorts, and admin filters.                           |
| Migrations             | Generated SQL committed; reproducible from zero (tested); advisory-locked runner; upgrade path with existing data tested; CI fails on schema drift.                   |
| Transactions           | Multi-table state changes are single transactions with row locks (review decisions, webhooks, submissions); no provider call inside a transaction; rollback tested. |
| Idempotency            | Contact/application duplicates, outbox enqueue, email deliveries (provider idempotency key), webhook events, scheduling bookings.                                     |
| Clock consistency      | Database-written timestamps are compared with database time (outbox scheduling, funnel periods, **application `submitted_at` (fixed in this phase)**).                 |
| Dependencies           | `npm audit --omit=dev`: **0 vulnerabilities**.                                                                                                                         |
| Docker image           | Multi-stage `node:24-alpine`, production dependencies only, non-root user, `HEALTHCHECK`, `node` as PID 1 so SIGTERM reaches the app; builds and passes the smoke test. |
| Health checks          | `/health` (liveness, no dependencies) and `/health/ready` (database ping with timeout); not rate-limited or logged.                                                   |
| Graceful shutdown      | SIGTERM/SIGINT → 503 for new requests, in-flight finish, **notification worker hands unstarted work back (added in this phase)**, pool closes, exit 0; forced exit on timeout. |
| OpenAPI                | Contract test asserts the full operation inventory, unique `operationId`s, tags, error envelopes, and security schemes, and that every documented operation is routed (root health probes now hidden, not duplicated). |
| Privacy                | **Added in this phase:** lead erasure endpoint and a retention job (below).                                                                                            |

### Fixed during the Phase 9 audit

1. Production-mode containers (`compose.yaml`, CI Docker smoke test) would not start: the email configuration introduced in Phase 7 was missing. Both now set it explicitly.
2. No request timeout (slow-client exposure): `REQUEST_TIMEOUT_MS` (default 30 s).
3. No security headers: added a headers plugin (see above).
4. Health operations lacked `operationId`s and were documented twice: root probes are now hidden.
5. Supabase API roles could execute `public` functions (a PostgREST RPC surface): migration 0007 revokes it. The mutation test proved the gap was real.
6. `applications.submitted_at` used the app clock while reports use the database clock; it is now set by the database.
7. The notification worker could be cut off mid-batch at shutdown: unstarted events are now released.
8. DATA_MODEL requires retention/deletion capability: it did not exist. Added erasure and retention.
9. Test timeouts were too tight for loaded machines: raised to 60 s.

## Requires external configuration

| Item                     | Action                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hosting                  | A container host with HTTPS termination; set `TRUST_PROXY` to the proxy hop count; route health checks to `/health`, readiness to `/health/ready`.                 |
| Supabase database        | `DATABASE_URL` (transaction pooler, port 6543), `MIGRATION_DATABASE_URL` (direct or session pooler, port 5432), `DATABASE_SSL_CA` for `verify-full`. Enable backups/PITR. |
| Supabase Auth            | `SUPABASE_URL`; **disable public sign-ups**; create staff users, then `npm run staff:prod -- add …`. Consider requiring MFA.                                         |
| Resend                   | Verify the sending domain; `RESEND_API_KEY` (sending access only), `EMAIL_FROM`; `STAFF_NOTIFICATION_EMAILS`.                                                      |
| Cal.com                  | Hidden event type → `CALCOM_BOOKING_URL`; webhook to `/api/v1/webhooks/scheduling/calcom` with `CALCOM_WEBHOOK_SECRET`; optional `CALCOM_API_KEY`. Verify with a test booking (the adapter follows Cal.com's documented formats and has not yet been run against a live account). |
| Frontend                 | `CORS_ALLOWED_ORIGINS` (site and admin dashboard), `SCHEDULING_PAGE_URL`, `ADMIN_DASHBOARD_URL`.                                                                 |
| Business content         | Real eligibility questions (`npm run forms:publish:prod`), service tiers, FAQs, testimonials, contact details, VSL URL, email wording (`templates.ts`).              |
| Scheduled job            | Run `node dist/db/scripts/retention.js` daily (host cron / scheduled task).                                                                                         |
| Monitoring               | Ship JSON logs; alert on `level ≥ 50` (error), especially `notification permanently failed` and `database is not reachable`; uptime check on `/health/ready`.      |
| Privacy/legal            | Retention periods, privacy notice (anonymous analytics), erasure procedure at providers.                                                                           |

## Intentionally out of scope

- Frontend, admin dashboard UI, client portal, public user accounts (CLAUDE.md).
- Payments and a custom calendar.
- Content-management admin API (services/FAQs/testimonials/site config are managed as data; `API_SPEC.md` › Content Admin API is not implemented).
- Staff management API (CLI instead), staff MFA enforcement, read-access auditing.
- Meeting completion/no-show endpoints, reconsideration of rejected applications.
- Multi-instance rate-limit store (see risks), analytics roll-ups, CAPTCHA provider (port ready, provider not chosen).

## Deployment environment variables

Required in production are marked **R**. All other variables have safe defaults. Full descriptions: `.env.example` and the docs linked.

| Group        | Variables                                                                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime      | `NODE_ENV=production` (image default), `HOST`, `PORT`, `TRUST_PROXY`, `LOG_LEVEL`, `SHUTDOWN_TIMEOUT_MS`, `REQUEST_TIMEOUT_MS`, `BODY_LIMIT_BYTES`, `API_DOCS_ENABLED`                                                                   |
| Database     | **R** `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `DATABASE_SSL` (default `verify-full`), `DATABASE_SSL_CA`, `DATABASE_POOL_MAX`, `DATABASE_CONNECTION_TIMEOUT_MS`, `DATABASE_STATEMENT_TIMEOUT_MS` ([docs/database.md](docs/database.md)) |
| HTTP         | **R** `CORS_ALLOWED_ORIGINS`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`, `CONTENT_CACHE_MAX_AGE_SECONDS`                                                                                                                                   |
| Public forms | `CONTACT_RATE_LIMIT_MAX`, `CONTACT_RATE_LIMIT_WINDOW_MS`, `APPLICATION_RATE_LIMIT_MAX`, `APPLICATION_RATE_LIMIT_WINDOW_MS`, `APPLICATION_STATUS_TOKEN_TTL_HOURS`, `ANALYTICS_RATE_LIMIT_MAX`, `ANALYTICS_RATE_LIMIT_WINDOW_MS`          |
| Staff auth   | `SUPABASE_URL` (admin API answers 503 without it), `SUPABASE_JWT_SECRET` (legacy only), `STAFF_AUTH_AUDIENCE` ([docs/admin.md](docs/admin.md))                                                                                          |
| Scheduling   | `SCHEDULING_PROVIDER=calcom`, `CALCOM_BOOKING_URL`, `CALCOM_WEBHOOK_SECRET`, `CALCOM_API_KEY`, `CALCOM_API_BASE_URL`, `CALCOM_API_VERSION`, `SCHEDULING_TOKEN_TTL_HOURS`, `SCHEDULING_PAGE_URL` ([docs/scheduling.md](docs/scheduling.md)) |
| Email        | **R** `EMAIL_PROVIDER` or (`RESEND_API_KEY` + `EMAIL_FROM`), `EMAIL_REPLY_TO`, `STAFF_NOTIFICATION_EMAILS`, `ADMIN_DASHBOARD_URL`, `NOTIFICATIONS_WORKER_ENABLED`, `NOTIFICATIONS_POLL_INTERVAL_MS`, `NOTIFICATIONS_BATCH_SIZE`, `NOTIFICATIONS_MAX_ATTEMPTS` ([docs/notifications.md](docs/notifications.md)) |

Development-only: `LOG_PRETTY`, `MOCK_SCHEDULING_WEBHOOK_SECRET` with `SCHEDULING_PROVIDER=mock`, `TEST_DATABASE_URL`. Both mock and pretty logging are refused in production. Invalid configuration stops startup and names the variables without printing their values.

## Migration and deployment commands

```bash
# CI / build
npm ci && npm run check && npm run build            # typecheck, lint, format, tests, compile
docker build -t phistream-backend:<version> .

# Release (same image, before starting new API instances)
docker run --rm -e MIGRATION_DATABASE_URL=… -e DATABASE_URL=… -e DATABASE_SSL_CA=… \
  phistream-backend:<version> node dist/db/scripts/migrate.js

# Start (the image runs node dist/server.js)
docker run -d -p 3000:3000 --env-file production.env phistream-backend:<version>

# One-off operations (same image)
node dist/db/scripts/staff.js add <supabase-user-id> <email> "<name>" ADMIN
node dist/db/scripts/publish-application-form.js <version> <definition.json>
node dist/db/scripts/retention.js --dry-run            # then without --dry-run, daily
```

- Migrations are forward-only, transactional per file, advisory-locked, and a no-op when current. The API never migrates on startup. Roll back by deploying a new forward migration.
- Graceful shutdown needs the platform stop timeout to exceed `SHUTDOWN_TIMEOUT_MS` (default 10 s).
- Local production rehearsal: `docker compose up --build` (db → migrate → api).

## Data retention and erasure

- **Erasure:** `DELETE /api/v1/admin/leads/:id` (ADMIN, audited as `lead.erased` with counts only) removes the person's lead, messages, applications, answers, notes, events, tokens, sessions, meetings, and related notification records. Anonymous analytics rows are unlinked. Copies held by Cal.com, Resend, and Supabase Auth must be erased in those systems too.
- **Retention:** `retention.js` deletes, using the database clock:
  - analytics events after 395 days;
  - settled notification events and their deliveries after 365 days;
  - webhook records after 365 days;
  - expired status tokens 30 days after expiry.

  Each period is adjustable with flags. Business records and audit logs are never deleted by the job. Runs are audited as `retention.applied`.

## Known risks

| Risk                                                                                                         | Mitigation / owner                                                                                                         |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Rate-limit counters are in memory per instance; with N instances, limits are N× looser.                      | Acceptable for one or two instances. Add a shared store (e.g. Redis) before scaling out; per-email caps are DB-enforced. |
| Cal.com adapter not yet exercised against a live account.                                                    | Adapter isolated in one file; do the documented test booking before launch.                                               |
| The Cal.com booking page is not per-applicant; outsiders who obtain the URL can book (unlinked, staff alerted). | Enable "requires confirmation" or private links in Cal.com.                                                               |
| Rare crash window around the acceptance email can leave the applicant with a rotated (invalid) link.         | Visible as a failed or duplicate notification; staff re-issue the link.                                                    |
| `drizzle-kit` (dev dependency) pulls a moderate esbuild advisory; no fix without a breaking downgrade.       | Dev-only tool, not in the image or runtime.                                                                                 |
| Admin lead search is a sequential `ILIKE` scan.                                                              | Fine at current scale; add `pg_trgm` indexes if leads grow large.                                                          |
| No CAPTCHA until a provider is chosen.                                                                       | Honeypot, link limit, per-IP and per-email limits active; `HumanVerifier` port ready.                                      |
| Staff MFA not enforced by the backend.                                                                       | Enable MFA in Supabase and require `aal2` (small change) before granting access broadly.                                   |
| No error-tracking service integrated.                                                                        | JSON logs with request ids; wire a log-based alert or an APM before launch.                                                |
