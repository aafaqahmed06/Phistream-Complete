# Database

PostgreSQL (hosted by Supabase in production) accessed only by this backend through Drizzle ORM and node-postgres. The browser never talks to the database.

- Schema: `src/db/schema/` (one file per module; `index.ts` re-exports)
- Migrations: `src/db/migrations/` (generated SQL, committed)
- Connection: `src/db/client.ts`
- Migration runner: `src/db/migrator.ts` + `src/db/scripts/migrate.ts`
- Demo seed: `src/db/seed/` + `src/db/scripts/seed.ts`

## Configuration

Credentials come from environment variables only. Never commit them. For local values see `.env.example`; in production use the host's secret store.

| Variable                         | Required                     | Purpose                                                                                                  |
| -------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                   | yes (except `NODE_ENV=test`) | Runtime connection used by the API (pooled)                                                              |
| `MIGRATION_DATABASE_URL`         | no                           | Connection used by migrations; falls back to `DATABASE_URL`                                              |
| `DATABASE_SSL`                   | no                           | `disable` \| `require` \| `verify-full`. Defaults to `verify-full` in production and `disable` elsewhere |
| `DATABASE_SSL_CA`                | no                           | PEM CA certificate for `verify-full` (`\n` escapes accepted)                                             |
| `DATABASE_POOL_MAX`              | no (10)                      | Pool size per instance                                                                                   |
| `DATABASE_CONNECTION_TIMEOUT_MS` | no (5000)                    | Time allowed to acquire a connection                                                                     |
| `DATABASE_STATEMENT_TIMEOUT_MS`  | no (15000)                   | Per-statement limit for API queries (`0` means none). Migrations never time out                          |
| `TEST_DATABASE_URL`              | tests only                   | Disposable database for `npm run test:db`. Its name must contain `test`                                  |

Any `sslmode=`/`sslrootcert=` parameters in the URL are ignored. `DATABASE_SSL` is the only SSL setting that applies. If connection settings are invalid, startup fails without printing the URL.

### Supabase

In the Supabase dashboard, open **Project Settings → Database**:

| Use                                   | Connection                           | Example host/port                                    |
| ------------------------------------- | ------------------------------------ | ---------------------------------------------------- |
| `DATABASE_URL` (running API)          | Transaction pooler (Supavisor)       | `aws-0-<region>.pooler.supabase.com:6543`            |
| `MIGRATION_DATABASE_URL` (migrations) | Direct connection, or session pooler | `db.<project-ref>.supabase.co:5432` / pooler `:5432` |

- **Migrations must not use the transaction pooler (port 6543).** The runner holds a session-level advisory lock so that two deploys can't migrate at the same time, and the transaction pooler does not support session state.
- The API is compatible with the transaction pooler because node-postgres does not use named prepared statements.
- **SSL:** keep `DATABASE_SSL=verify-full` and set `DATABASE_SSL_CA` to the certificate from **Database → SSL configuration**. `require` encrypts the connection but does not verify the server, so use it only as a stopgap.
- Connect as the `postgres` user, which owns the tables. Do not use the Data API keys (`anon`, `service_role`) from this backend.

## Security posture

- **Every table has Row Level Security enabled and no policies.** Roles other than the table owner therefore can't read or write any rows. The backend connects as the owner, which bypasses RLS.
- Migration `0001_revoke_supabase_api_roles` removes the privileges Supabase grants by default to its Data API roles (`anon`, `authenticated`) on `public` tables, and blocks those grants on future tables. On plain PostgreSQL it does nothing. It adds a second layer of protection on top of RLS: the tables are not reachable through `https://<project>.supabase.co/rest/v1/...`.
- Public content (`service_tiers`, `faqs`, `testimonials`, `site_config`) lives in separate tables from private data (`leads`, `contact_submissions`, `applications*`, `application_access_tokens`, `scheduling_sessions`, `meetings`, `analytics_events`, `staff_users`, `audit_logs`, `notification_events`, `notification_deliveries`). Content is visible only when `is_active`/`is_public` is true, and new rows are hidden by default. `application_forms` is private too; only the ACTIVE definition is served, deliberately, through `GET /applications/form`.
- Scheduling and application status tokens are stored only as SHA-256 hashes (`scheduling_sessions.token_hash`, `application_access_tokens.token_hash`).
- `site_config` rows reach public endpoints only if their key is on the typed allow-list in `src/modules/content/site-config.registry.ts` **and** `is_public = true` **and** the value passes the key's schema. To publish a new setting, register it first, then insert it with `is_public = true`.

## Migration workflow

Migrations are **generated SQL files, reviewed and committed**, and then **applied by the migration runner**. `drizzle-kit push` is never used; there is no npm script for it on purpose.

### Changing the schema (development)

```bash
# 1. Edit src/db/schema/*.ts
npm run db:generate              # writes src/db/migrations/NNNN_<name>.sql + snapshot
#    (optional) npx drizzle-kit generate --name add_something
# 2. Review the SQL. Never edit a migration that has already been applied anywhere.
npm run db:migrate               # apply it to your local database
npm run db:check                 # validate migration history consistency
npm run test:db                  # constraints/migration tests against TEST_DATABASE_URL
# 3. Commit schema + migration + meta/ snapshot together.
```

For SQL that drizzle-kit can't express (grants, data backfills), use `npx drizzle-kit generate --custom --name <name>` and write the SQL by hand.

CI fails a pull request if `drizzle-kit generate` would produce a new migration, i.e. when the schema changed but no migration was committed.

### Applying migrations (production)

Run migrations as a **separate release step before new API instances start**, using the same image:

```bash
node dist/db/scripts/migrate.js      # or: npm run db:migrate:prod
```

- Each migration file runs in its own transaction. Applied migrations are recorded in `drizzle.__drizzle_migrations`, so re-running is a no-op.
- The advisory lock makes concurrent runs wait instead of racing.
- The API does **not** migrate on startup, so a failed migration never leaves half-started instances.
- Prefer backward-compatible (expand/contract) changes, so the old code keeps working while the migration runs.
- Roll back by writing a new forward migration. There are no down migrations.

`compose.yaml` models the same flow locally: `db` → `migrate` (exits) → `api`.

## Seeding

```bash
npm run db:seed
```

- Inserts **demo data only** (`src/db/seed/demo-data.ts`). Text is marked `[DEMO]`, contacts and URLs use `example.com`, prices use the ISO 4217 test currency `XTS`, and ids fall in the `00000000-0000-4000-8000-…` range.
- It is idempotent: existing rows are skipped, never overwritten.
- It refuses to run when `NODE_ENV=production`.
- It includes inactive and private rows on purpose, so tests can prove they never leak publicly.

Real service tiers, prices, FAQs, testimonials, eligibility questions, contact details and the VSL URL must come from the business and be entered as data, not added to the seed.

## Local database

```bash
npm run db:up        # PostgreSQL 17 on localhost:54329 (databases: phistream, phistream_test)
npm run db:migrate
npm run db:seed
npm run db:studio    # browse the schema/data (drizzle-kit studio)
npm run db:down
```

To reset completely, run `docker compose down -v`. This deletes the local volume.

## Modelling decisions

| Decision                                                                                                                                                         | Reason                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TEXT + CHECK constraints instead of PostgreSQL enum types                                                                                                        | Adding a value is an ordinary transactional migration; allowed values live in `src/db/schema/enums.ts`                                                                                            |
| `applications.status` holds all ARCHITECTURE.md state-machine states (`NEW` … `CONVERTED`, plus `WITHDRAWN`/`ARCHIVED`/`NO_SHOW`)                                | DATA_MODEL.md suggests a shorter list; ARCHITECTURE.md's state machine is treated as authoritative. Valid _transitions_ are enforced in the domain layer (Phase 4)                                |
| `application_events.event_type`, `notification_deliveries.event_type`: format check only (`UPPER_SNAKE`)                                                         | The full lists are defined by later phases; DATA_MODEL only gives examples                                                                                                                        |
| `leads.email`: case-insensitive index, **not unique**                                                                                                            | DATA_MODEL: don't assume one lead per email until the business confirms                                                                                                                           |
| `applications.reference` (unique)                                                                                                                                | API_SPEC returns a public-safe reference (e.g. `PHI-2026-AB12`); the format is decided in Phase 4                                                                                                 |
| Money: `price_amount` integer minor units + `currency` (ISO 4217), both nullable but set together                                                                | Currency and billing period have not been supplied yet                                                                                                                                            |
| Deleting a lead cascades to its applications, answers, notes, events, scheduling sessions and meetings; analytics events are unlinked (`SET NULL`)               | Supports deletion/retention requests while keeping anonymous funnel counts                                                                                                                        |
| Service tiers and staff users are `RESTRICT`ed                                                                                                                   | Deactivate instead of deleting; keeps review history attributable                                                                                                                                 |
| `audit_logs.entity_id`, `application_events.actor_id`: no foreign key                                                                                            | They can point to different entity types                                                                                                                                                          |
| `meetings`: unique `(provider, provider_event_id)`                                                                                                               | DATA_MODEL says `provider_event_id UNIQUE`; scoping it per provider is safer across providers                                                                                                     |
| `analytics_events.referrer` added                                                                                                                                | Required by ARCHITECTURE.md › Analytics, but missing from DATA_MODEL.md                                                                                                                           |
| `contact_submissions` added (Phase 3): one row per contact message, with the contact details as submitted; cascades with its lead                                | DATA_MODEL.md has nowhere to keep contact messages. The public endpoint may not overwrite lead fields, so each message keeps what was actually sent                                               |
| `notification_events` added (Phase 3): transactional outbox, one row per (event type, subject), no payload                                                       | "Create an internal notification event" atomically with the business change, without copying PII or needing a recipient/provider yet (Phase 7 consumes it)                                        |
| Contact deduplication uses a per-email advisory lock, not a unique index                                                                                         | Keeps `leads.email` non-unique (above) while still preventing duplicate leads from concurrent submissions. See [lead-capture.md](lead-capture.md)                                                 |
| `application_forms` added (Phase 4): versioned question definitions (`DRAFT`/`ACTIVE`/`RETIRED`, one ACTIVE); `applications.form_version` is a foreign key to it | Questions are data, not code. The FK guarantees every application's answers can be interpreted. Migration 0003 registers pre-existing versions as RETIRED placeholders                            |
| Published form definitions are immutable (trigger `application_forms_protect_published`, hand-written in migration 0003)                                         | Changing a question after people answered it would silently change what their answers mean. Publish a new version instead. See [applications.md](applications.md)                                 |
| `application_access_tokens` added (Phase 4): hashed, expiring, revocable bearer tokens with a `purpose`                                                          | Proof of possession for the public status endpoint. UUIDs alone grant nothing. Cascades with the application                                                                                      |
| `applications.submission_fingerprint` (SHA-256, partial index)                                                                                                   | Detects accidental resubmission without comparing answer rows                                                                                                                                     |
| `scheduling_sessions.booking_ref_hash` added (Phase 6)                                                                                                           | Links provider bookings to applications via a hash of a reference derived from the access token; nothing raw is stored. See [scheduling.md](scheduling.md)                                        |
| `scheduling_webhook_events` added (Phase 6): one row per (provider, event id), with outcome, and no payload                                                      | Idempotent webhook processing (the row is inserted in the processing transaction) and an operational record of unmatched or ineligible bookings. Payloads contain attendee PII and are not stored |
| `notification_events.next_attempt_at` / `locked_until` added (Phase 7)                                                                                           | Worker scheduling with backoff and leases (`FOR UPDATE SKIP LOCKED`), so several instances can dispatch safely. All timing uses the database clock. See [notifications.md](notifications.md)      |
| `notification_deliveries.notification_event_id` + `template`, unique with `recipient` (Phase 7)                                                                  | One delivery per event/template/recipient: sending is idempotent and the row id is the provider idempotency key. Bodies are never stored                                                          |
| `applications.source` / `campaign` added (Phase 8), backfilled from the lead in migration 0006                                                                   | Per-application attribution: the lead keeps its first touch, the application records the touch that produced it. Indexed with `submitted_at` for funnel cohorts. See [analytics.md](analytics.md) |
| `analytics_events` is written only by `POST /analytics/events`, with the nine client events                                                                      | Business outcomes are never read from it: the funnel uses applications/meetings. Server-only names stay in the CHECK list for possible future server-side events                                  |
| Migration 0007 revokes `EXECUTE` on `public` functions from `anon`/`authenticated` (Phase 9)                                                                     | Closes the PostgREST RPC surface (0001 covered tables/sequences only); tested                                                                                                                     |
| `applications.submitted_at` is set by the database                                                                                                               | Reports compare it with database time (clock-skew safe)                                                                                                                                           |
| `meetings.provider_event_id` holds the provider **booking** id                                                                                                   | Unique per provider, so the same booking can never create two meetings                                                                                                                            |
| `applications_rejection_reason_only_when_rejected` now also allows `ARCHIVED`                                                                                    | A rejected application keeps its reason after being archived (the state machine allows REJECTED → ARCHIVED)                                                                                       |
| `updated_at` maintained by Drizzle (`$onUpdate`)                                                                                                                 | All writes go through the app. Add a DB trigger if manual SQL edits become common                                                                                                                 |
