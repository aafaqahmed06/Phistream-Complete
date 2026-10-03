# Claude Code Prompts — Phistream Studio Backend

Use these sequentially. Let Claude finish and test each phase before moving to the next.

The repository should contain `CLAUDE.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `API_SPEC.md`, and `BUILD_PLAN.md` before the first implementation prompt.

---

## Prompt 1 — Scaffold the backend

```text
Read CLAUDE.md, ARCHITECTURE.md, DATA_MODEL.md, API_SPEC.md, and BUILD_PLAN.md completely.

You are building ONLY the backend for Phistream Studio. Do not build frontend pages.

Implement BUILD_PLAN Phase 0.

Use:
- Node.js 24 LTS
- TypeScript strict mode
- Fastify 5
- Vitest
- Pino/Fastify logging
- OpenAPI/Swagger
- Docker
- GitHub Actions

Create a clean modular project structure.

Requirements:
- environment validation at startup
- health endpoint
- consistent error envelope
- request IDs
- strict CORS configuration driven by environment
- sensible request body limits
- rate limiting foundation
- graceful shutdown
- no secrets committed
- useful npm scripts
- lint/typecheck/test commands

Do not implement business features yet.

After implementation:
1. run typecheck
2. run lint
3. run tests
4. build the production artifact
5. test the Docker build if Docker is available

Fix any issues you introduce.

Finally, summarize files created/changed and show the exact commands for local development.
```

---

## Prompt 2 — Build the database

```text
Read CLAUDE.md, DATA_MODEL.md, and BUILD_PLAN.md.

Implement BUILD_PLAN Phase 1.

Use Supabase-hosted PostgreSQL with Drizzle ORM and drizzle-kit.

Create:
- database connection module
- Drizzle schema
- production-safe migration workflow
- seed script with fake/demo data only
- indexes and constraints described in DATA_MODEL.md

Important:
- do not invent real Phistream service tiers, prices, FAQs, testimonials, eligibility questions, contact details, or VSL URL
- use clearly marked demo seed content
- use UUID primary keys
- use UTC timestamps
- use enums/check constraints where appropriate
- preserve referential integrity
- keep private application data separate from public content

Do not use `drizzle-kit push` as the production migration mechanism.

Run:
- typecheck
- lint
- tests
- migration generation/validation
- seed against a local/test database if available

Document required DATABASE_URL configuration without putting credentials in the repository.
```

---

## Prompt 3 — Public content API

```text
Read CLAUDE.md, API_SPEC.md, DATA_MODEL.md, and BUILD_PLAN.md.

Implement BUILD_PLAN Phase 2.

Create the public API for:
- GET /api/v1/content/home
- GET /api/v1/content/services
- GET /api/v1/content/services/:slug
- GET /api/v1/content/faqs
- GET /api/v1/content/testimonials
- GET /api/v1/content/onboarding

Requirements:
- public endpoints expose only active/publishable records
- validate route params
- consistent response shapes
- pagination if any endpoint can grow large
- OpenAPI documentation
- tests for public visibility boundaries
- no admin/private fields
- no database credentials or provider details exposed

Keep route handlers thin. Put business/data access in modules/services.

Do not invent production business content.
```

---

## Prompt 4 — Contact and lead capture

```text
Read CLAUDE.md, API_SPEC.md, DATA_MODEL.md, and BUILD_PLAN.md.

Implement BUILD_PLAN Phase 3.

Create:
POST /api/v1/contact

Behavior:
- validate input with Zod
- normalize email
- enforce length limits
- create/update a lead according to a deliberate deduplication policy
- capture source/campaign when supplied
- rate limit the endpoint
- create an internal notification event
- return a generic success response
- do not leak whether an email already exists

Add anti-spam architecture without tying the domain logic to a single CAPTCHA provider.

Do not log full request bodies or message contents.

Add tests for:
- valid submission
- invalid email
- oversized fields
- rate limiting
- duplicate lead behavior
- no PII leakage in logs where practical

Update OpenAPI.
```

---

## Prompt 5 — Eligibility application workflow

```text
Read CLAUDE.md, API_SPEC.md, DATA_MODEL.md, and BUILD_PLAN.md.

Implement BUILD_PLAN Phase 4.

This is the core Phistream workflow.

Create:
POST /api/v1/applications
GET /api/v1/applications/:id/status

Implement:
- application form versioning
- service-tier validation
- lead association
- versioned JSON answers
- application lifecycle events
- application status machine
- internal notification event

Do NOT invent the actual eligibility questions. Build the schema so questions can be configured/versioned later.

Security requirements:
- never expose internal notes
- never expose raw application answers through an unauthenticated endpoint
- UUIDs are not authorization
- status endpoint must use safe proof of possession/short-lived access
- rate limit application submission
- do not reveal private application state to arbitrary callers

Test every invalid state transition you can identify.

Update OpenAPI and documentation.
```

---

## Prompt 6 — Admin authentication and review API

```text
Read CLAUDE.md, ARCHITECTURE.md, API_SPEC.md, DATA_MODEL.md, and BUILD_PLAN.md.

Implement BUILD_PLAN Phase 5.

There is NO public user authentication requirement.

Implement staff/admin authentication only, using the selected auth provider integration. Prefer Supabase Auth if it fits the existing Supabase setup.

Create:
- staff user mapping
- ADMIN and REVIEWER roles
- authenticated admin middleware
- GET /api/v1/admin/leads
- GET /api/v1/admin/applications
- GET /api/v1/admin/applications/:id
- POST /api/v1/admin/applications/:id/review
- POST /api/v1/admin/applications/:id/accept
- POST /api/v1/admin/applications/:id/reject
- POST /api/v1/admin/applications/:id/notes
- GET /api/v1/admin/audit-logs

Requirements:
- pagination
- filtering
- authorization
- audit logging
- transactionally safe application state changes
- no arbitrary status mutation endpoint
- no raw database errors to clients
- no frontend

Acceptance must create scheduling eligibility as a domain event/state transition, but provider integration can remain for the scheduling phase.

Test:
- unauthenticated requests
- insufficient role
- valid reviewer actions
- invalid state transitions
- audit log creation
- private data access
```

---

## Prompt 7 — Scheduling provider

```text
Read CLAUDE.md, ARCHITECTURE.md, API_SPEC.md, DATA_MODEL.md, and BUILD_PLAN.md.

Implement BUILD_PLAN Phase 6.

Do not build a calendar system.

Create a SchedulingProvider abstraction and implement the first provider selected for the project.

The provider implementation must be isolated from the application domain.

Implement:
- accepted-application scheduling eligibility
- short-lived scheduling access
- secure token handling
- booking lookup
- provider webhook verification
- idempotent webhook processing
- meeting record creation/update

Requirements:
- rejected/unreviewed applications cannot schedule
- tokens expire
- raw tokens are never stored if avoidable
- webhook signatures are verified
- provider event IDs are deduplicated
- booking cancellation/rescheduling is handled
- no provider secret reaches the frontend

Add integration tests around the adapter and domain state transitions.

If provider credentials are missing, create a test/mock provider and document the exact environment variables required. Do not fabricate credentials.
```

---

## Prompt 8 — Transactional email

```text
Read CLAUDE.md, ARCHITECTURE.md, and BUILD_PLAN.md.

Implement BUILD_PLAN Phase 7.

Create an EmailProvider abstraction and implement Resend.

Create templates for:
- new application → staff
- accepted application → applicant
- rejected application → applicant
- meeting booked → applicant/staff
- contact received → staff

Requirements:
- no provider-specific calls from domain modules
- notification failures must be observable
- do not expose provider API keys
- do not put secrets in templates
- avoid logging message bodies
- store delivery status/provider message ID where useful
- make notification handling idempotent where appropriate

If RESEND_API_KEY or sender domain is not configured, provide a safe local/mock implementation.

Add tests with a fake provider.
```

---

## Prompt 9 — Funnel analytics

```text
Read CLAUDE.md, ARCHITECTURE.md, DATA_MODEL.md, API_SPEC.md, and BUILD_PLAN.md.

Implement BUILD_PLAN Phase 8.

Create:
POST /api/v1/analytics/events
GET /api/v1/admin/analytics/funnel

Support:
- onboarding_view
- vsl_start
- vsl_25
- vsl_50
- vsl_75
- vsl_complete
- application_start
- application_submit
- scheduling_opened

Do not accept privileged business outcomes from the client. For example, the browser must not be able to create an `application_accepted` event.

Admin funnel metrics should be calculated from authoritative backend data where possible.

Add source/campaign attribution.

Minimize visitor data. Do not create invasive tracking or store unnecessary PII.

Add tests for event allowlists and aggregation.
```

---

## Prompt 10 — Production hardening

```text
Read every project documentation file before starting.

Implement BUILD_PLAN Phase 9.

Perform a production-readiness audit of the entire backend.

Check:
- authentication
- authorization
- CORS
- rate limiting
- request size limits
- validation
- SQL injection resistance
- webhook signature verification
- token handling
- PII exposure
- logs
- secrets
- error responses
- database permissions
- indexes
- migrations
- transaction boundaries
- idempotency
- dependency vulnerabilities
- Docker image
- health checks
- graceful shutdown
- OpenAPI accuracy
- tests

Do not merely produce a checklist. Fix issues you find.

Then run:
- lint
- typecheck
- unit tests
- integration tests
- build
- Docker build

Finally produce a concise PRODUCTION_READINESS.md containing:
- what was verified
- what requires external configuration
- what remains intentionally out of scope
- deployment environment variables
- migration/deployment commands
- known risks
```
