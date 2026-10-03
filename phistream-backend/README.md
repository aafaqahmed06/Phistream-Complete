# Phistream Studio Backend

Backend API for Phistream Studio. Backend only: the public website is built separately.

Design docs: [CLAUDE.md](CLAUDE.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [DATA_MODEL.md](DATA_MODEL.md) · [API_SPEC.md](API_SPEC.md) · [BUILD_PLAN.md](BUILD_PLAN.md)

**Status:** Phases 0–9 are done (production-hardened; see [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md)): foundation, database, the public content API (`/api/v1/content/*`, see [API_SPEC.md](API_SPEC.md#public-content)), contact/lead capture (`POST /api/v1/contact`, see [API_SPEC.md](API_SPEC.md#post-contact)), eligibility applications (`/api/v1/applications*`, see [API_SPEC.md](API_SPEC.md#applications)), the staff-only admin API with Supabase Auth (`/api/v1/admin/*`, see [API_SPEC.md](API_SPEC.md#admin-api)), scheduling through Cal.com behind a provider adapter (see [API_SPEC.md](API_SPEC.md#scheduling)), transactional email through Resend (outbox worker; see [docs/notifications.md](docs/notifications.md)), and privacy-preserving funnel analytics (see [API_SPEC.md](API_SPEC.md#analytics)).

Guides: [docs/database.md](docs/database.md) · [docs/lead-capture.md](docs/lead-capture.md) (dedup policy, anti-spam, notification outbox) · [docs/applications.md](docs/applications.md) (form versioning, publishing forms, status tokens, state machine) · [docs/admin.md](docs/admin.md) (staff auth setup, provisioning, roles, audit) · [docs/scheduling.md](docs/scheduling.md) (scheduling flow, Cal.com setup, env vars, mock provider) · [docs/notifications.md](docs/notifications.md) (email templates, Resend setup, retries, observability) · [docs/analytics.md](docs/analytics.md) (events, frontend snippet, funnel definitions).

## Requirements

- Node.js 24 LTS (`.nvmrc`)
- npm 11+
- Docker (optional, for container builds)

## Local development

```bash
npm install
cp .env.example .env      # defaults point at the local compose database
npm run db:up             # PostgreSQL 17 on localhost:54329
npm run db:migrate        # apply migrations
npm run db:seed           # optional: demo data
npm run dev               # http://localhost:3000, auto-reloads on changes
```

- Liveness: `GET /health` and `GET /api/v1/health`
- Readiness (checks the database): `GET /health/ready` and `GET /api/v1/health/ready`
- API docs (Swagger UI): `http://localhost:3000/docs` (OpenAPI JSON at `/docs/json`)

## Scripts

| Command                           | Purpose                                            |
| --------------------------------- | -------------------------------------------------- |
| `npm run dev`                     | Run from source with watch mode (loads `.env`)     |
| `npm run build`                   | Compile to `dist/`                                 |
| `npm start`                       | Run the compiled server (env from the environment) |
| `npm run start:local`             | Run the compiled server, loading `.env`            |
| `npm run typecheck`               | TypeScript strict type check                       |
| `npm run lint` / `lint:fix`       | ESLint (type-aware)                                |
| `npm run format` / `format:check` | Prettier                                           |
| `npm test`                        | Vitest (single run)                                |
| `npm run test:watch`              | Vitest watch mode                                  |
| `npm run test:coverage`           | Tests with coverage report                         |
| `npm run test:db`                 | Database tests only (needs `TEST_DATABASE_URL`)    |
| `npm run check`                   | typecheck + lint + format check + tests            |
| `npm run db:up` / `db:down`       | Start/stop local PostgreSQL (compose)              |
| `npm run db:generate`             | Generate a SQL migration from schema changes       |
| `npm run db:check`                | Validate migration history                         |
| `npm run db:migrate`              | Apply migrations (from source, loads `.env`)       |
| `npm run db:migrate:prod`         | Apply migrations from `dist/` (release step)       |
| `npm run db:seed`                 | Insert demo data (refuses in production)           |
| `npm run db:studio`               | Browse the database (drizzle-kit studio)           |
| `npm run forms:publish -- <version> <file.json>` | Publish a new eligibility form version (`forms:publish:prod` from `dist/`) |
| `npm run staff -- <add|role|deactivate|activate|list> …` | Provision staff users and roles (`staff:prod` from `dist/`) |
| `npm run retention -- [--dry-run]` | Apply the data-retention policy (`retention:prod` from `dist/`; run daily) |
| `npm run docker:build`            | Build the production image                         |
| `npm run docker:up`               | Build and run the image via `compose.yaml`         |

## Configuration

Environment variables are checked with Zod when the server starts (`src/config/env.ts`). If any value is invalid, the process prints which variables are wrong (never their values) and exits with code 1. See `.env.example` for every variable.

| Variable               | Default               | Notes                                                                  |
| ---------------------- | --------------------- | ---------------------------------------------------------------------- |
| `NODE_ENV`             | `development`         | `development` \| `test` \| `production`                                |
| `HOST` / `PORT`        | `0.0.0.0` / `3000`    |                                                                        |
| `LOG_LEVEL`            | `info`                | pino level                                                             |
| `LOG_PRETTY`           | `false`               | Not allowed in production                                              |
| `CORS_ALLOWED_ORIGINS` | _(empty)_             | Comma-separated list of exact origins. **Required in production.** No `*` |
| `TRUST_PROXY`          | `false`               | `false`, a hop count (e.g. `1`), or IP/CIDR list. `true` is rejected   |
| `BODY_LIMIT_BYTES`     | `102400`              | Larger bodies get `413 PAYLOAD_TOO_LARGE`                              |
| `RATE_LIMIT_MAX`       | `100`                 | Requests per window per client IP (global default)                     |
| `RATE_LIMIT_WINDOW_MS` | `60000`               |                                                                        |
| `SHUTDOWN_TIMEOUT_MS`  | `10000`               | Forced exit deadline during graceful shutdown                          |
| `REQUEST_TIMEOUT_MS`   | `30000`               | Maximum time to receive a whole request                               |
| `API_DOCS_ENABLED`     | on unless production  | Serves `/docs`                                                         |
| `CONTENT_CACHE_MAX_AGE_SECONDS` | `60`          | `Cache-Control` max-age for public content (`0` = `no-cache`)          |
| `CONTACT_RATE_LIMIT_MAX` | `5`                 | Per-IP requests to `POST /contact` per window (own counter)            |
| `CONTACT_RATE_LIMIT_WINDOW_MS` | `600000`      | 10 minutes                                                             |
| `APPLICATION_RATE_LIMIT_MAX` | `5`             | Per-IP `POST /applications` per window (own counter)                   |
| `APPLICATION_RATE_LIMIT_WINDOW_MS` | `3600000` | 1 hour                                                                 |
| `APPLICATION_STATUS_TOKEN_TTL_HOURS` | `168`   | Lifetime of the applicant status token (1–2160)                        |
| `SUPABASE_URL`         | _(none)_              | Supabase project URL; enables the admin API (staff auth). See [docs/admin.md](docs/admin.md) |
| `SUPABASE_JWT_SECRET`  | _(none)_              | Legacy HS256 secret only; prefer the JWKS (asymmetric keys)            |
| `STAFF_AUTH_AUDIENCE`  | `authenticated`       | Expected `aud` of staff access tokens                                  |
| `SCHEDULING_PROVIDER`  | _(none)_              | `calcom` or `mock` (dev only); unset = scheduling disabled. Provider variables: [docs/scheduling.md](docs/scheduling.md#configuration) |
| `SCHEDULING_TOKEN_TTL_HOURS` | `72`            | Lifetime of an applicant scheduling token                              |
| `SCHEDULING_PAGE_URL`  | _(none)_              | Frontend scheduling page; links carry the token in the URL fragment    |
| `EMAIL_PROVIDER`       | resend if configured, else `log` | Production requires Resend (`RESEND_API_KEY` + verified `EMAIL_FROM`) or explicit `log`. All email variables: [docs/notifications.md](docs/notifications.md#configuration) |
| `STAFF_NOTIFICATION_EMAILS` | active ADMIN staff | Recipients of internal notifications                                   |
| `NOTIFICATIONS_WORKER_ENABLED` | `true`      | In-process outbox worker                                               |
| `ANALYTICS_RATE_LIMIT_MAX` | `120`             | Per-IP `POST /analytics/events` per window (`ANALYTICS_RATE_LIMIT_WINDOW_MS`, default 60000) |
| `DATABASE_URL`         | _(none)_              | **Required** (except `NODE_ENV=test`). See [docs/database.md](docs/database.md) |
| `MIGRATION_DATABASE_URL` | = `DATABASE_URL`   | Direct/session connection for migrations                               |
| `DATABASE_SSL`         | `verify-full` in prod | `disable` | `require` | `verify-full` (+ `DATABASE_SSL_CA`)          |
| `DATABASE_POOL_MAX` etc. | see `.env.example` | Pool size and connection/statement timeouts                            |

## Conventions

### Error envelope

Every error response has the same shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The submitted data is invalid.",
    "requestId": "3f0c…",
    "details": [{ "location": "body", "path": "/email", "message": "Invalid email address" }]
  }
}
```

- `code` is one of the values in `ERROR_CODES` (`src/shared/errors/app-error.ts`).
- `details` only appears for validation errors (and for `AppError`s that include details). It never contains the submitted values.
- 5xx responses always return a generic message, and stack traces are never included. The full error is logged on the server along with the `requestId`.
- To raise an expected error from application code, throw `new AppError(status, code, clientSafeMessage)`.

### Request IDs

Every response includes an `x-request-id` header, and the same ID appears in the logs as `requestId`. If an incoming `x-request-id` is safe (`[A-Za-z0-9._:-]{8,128}`), it is reused; otherwise the server generates a UUID.

### Logging

Logs are structured JSON from pino. For each request the log records only the method, the path without its query string, the status code, and the response time. Headers, query strings, and bodies are never logged. Successful health-check requests are not logged.

### CORS

CORS uses a strict allow-list taken from `CORS_ALLOWED_ORIGINS`. Credentials (cookies) are disabled; staff auth uses bearer tokens (`Authorization` is an allowed header). Add the admin dashboard origin here.

### Rate limiting

- A global limit, keyed by client IP, applies to every route. Unknown routes are limited too, which slows down path scanning. Health checks are exempt.
- A route can override the limit with `config: { rateLimit: { max, timeWindow } }`. Public form endpoints should use stricter limits.
- The store is in-memory, so each instance keeps its own counts. Switch to a shared store such as Redis before running more than one instance.
- Set `TRUST_PROXY` correctly when running behind a load balancer. Otherwise every client appears to have the proxy's IP.

### Graceful shutdown

On `SIGTERM` or `SIGINT`, the server stops accepting connections and answers new requests with 503. It lets in-flight requests finish, runs the `onClose` hooks, and exits with code 0. If shutdown takes longer than `SHUTDOWN_TIMEOUT_MS`, or a second signal arrives, the process exits with code 1.

## Project structure

```text
src/
  app.ts                  buildApp(): configured Fastify instance (no listen)
  server.ts               entrypoint: load config, listen, shutdown handling
  config/                 env validation, constants
  db/
    client.ts             pg pool + Drizzle instance, readiness ping
    migrator.ts           applies committed migrations (advisory-locked)
    schema/               Drizzle tables, CHECK-constrained value lists
    migrations/           generated SQL migrations (committed)
    seed/                 demo data + idempotent seeder
    scripts/              migrate/seed CLIs
  modules/
    health/               liveness + readiness routes
    content/              public content: routes -> service -> repository, site-config registry
    admin/                admin API: permissions, audit log, staff mapping/provisioning, read models
    scheduling/           scheduling access tokens, webhook processing, meetings (provider-agnostic)
    notifications/        outbox, email dispatcher + worker, templates
    analytics/            anonymous funnel events, funnel aggregation
    applications/         eligibility form versions, submission, status tokens, state machine, lifecycle, review actions
    leads/                contact form, shared lead resolution, per-email locked transactions
    notifications/        notification outbox (events written in the caller's transaction)
  plugins/                cors, rate-limit, swagger, auth (staff authentication for the admin scope)
  providers/
    auth/                 staff token verification (Supabase Auth JWKS / legacy secret)
    scheduling/           SchedulingProvider port + Cal.com and mock adapters
    email/                EmailProvider port + Resend and log adapters
  shared/
    anti-spam/            provider-agnostic SpamGuard, checks, HumanVerifier (CAPTCHA) port
    security/             opaque bearer tokens (generate, hash, parse)
    validation/           shared Zod field rules for public forms
    errors/               AppError, error envelope, error/404 handlers
    http/                 request ID generation
    lifecycle/            graceful shutdown
    logging/              pino options (serializers, redaction, PII-safe error serializer)
tests/
  unit/                   pure functions (env, request IDs, shutdown, schema conventions)
  integration/            full app via app.inject()
  db/                     real PostgreSQL: migrations, constraints, seed (TEST_DATABASE_URL)
```

New feature modules go under `src/modules/<name>/` (`*.routes.ts` thin handlers → `*.service.ts` business rules, framework-free → `*.repository.ts` Drizzle queries) and are wired in the composition root in `src/app.ts`, inside the `/api/v1` scope. Route schemas are written in Zod (via `fastify-type-provider-zod`). The same schemas handle request validation, response serialization, and OpenAPI generation.

## Docker

```bash
npm run docker:build                                     # or: docker build -t phistream-backend:local .
docker compose up --build                                # db -> migrate -> api on http://localhost:3000
```

The image is a multi-stage `node:24-alpine` build. It contains only production dependencies, runs as the non-root `node` user, and includes a `HEALTHCHECK` against `/health`.

## Vercel

In the `Phistream-Complete` monorepo this backend deploys as the `api` service of one Vercel project (the root `vercel.json`), alongside the website. `/api/*` and `/health*` on the site's domain route here; the API has no other public URL.

- Vercel runs `npm run build` and serves the compiled `dist/`. The build writes `dist/package.json` (`{"type":"module"}`) because the function bundle does not include this folder's `package.json`, and without it Node loads the ES-module output as CommonJS and fails on the first `import`.
- Set in the Vercel project (Production and Preview): `DATABASE_URL` (sensitive), `DATABASE_SSL=require`, `DATABASE_POOL_MAX=3` (serverless instances each hold a pool), `EMAIL_PROVIDER=log` (or Resend settings), `CORS_ALLOWED_ORIGINS=<site origin>` (required in production), `TRUST_PROXY=1` (Vercel overwrites `X-Forwarded-For` with the client IP, so rate limits key on real visitors), `NOTIFICATIONS_WORKER_ENABLED=false` (in-process timers do not run reliably between serverless invocations).
- Rate-limit counters are in memory per function instance, so limits are approximate on serverless until a shared store is added.

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests:

1. The `verify` job runs against a PostgreSQL service container. It runs typecheck, lint, and the format check; validates the migration history; fails if the schema changed without a committed migration; runs the migrate and seed scripts on a clean database; then runs all tests (including the database tests), the build, and `npm audit` (production dependencies, high severity and above).
2. The `docker` job builds the image, runs migrations from that image, starts it, checks the liveness and readiness endpoints, and confirms that the container exits with code 0 on `SIGTERM`.

## Secrets

Never commit `.env` files, API keys, or database URLs. `.gitignore` and `.dockerignore` already exclude `.env*` (except `.env.example`). Production values belong in the hosting platform's secret store.
