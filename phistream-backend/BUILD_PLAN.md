# Phistream Studio Backend Build Plan

Build in phases. Do not attempt to implement the entire system in one pass.

## Phase 0 — Foundation

Deliver:

- Node.js/TypeScript project
- Fastify
- strict TypeScript
- environment validation
- structured logging
- error handling
- health endpoint
- OpenAPI/Swagger
- CORS configuration
- rate limiting
- Docker setup
- test setup
- lint/format/typecheck
- CI

Endpoints:

```text
GET /health
GET /api/v1/health
```

Acceptance:

- project starts locally
- invalid environment fails fast
- health endpoint works
- tests run
- Docker build succeeds

## Phase 1 — Database

Implement:

- Drizzle schema
- PostgreSQL connection
- migration setup
- all core tables
- constraints
- indexes
- seed data with obviously fake/demo content

Do not invent real Phistream business content.

Acceptance:

- clean database can be migrated from zero
- seed runs
- schema can be inspected
- migration is reproducible

## Phase 2 — Public content API

Implement:

- services
- FAQs
- testimonials
- onboarding config
- public site config

Add caching headers where useful.

Acceptance:

- only active/publishable content is public
- inactive/private rows never leak
- OpenAPI is complete
- tests cover public/private boundaries

## Phase 3 — Contact + lead capture

Implement:

- contact endpoint
- lead creation/update logic
- source/campaign attribution
- rate limiting
- spam protection hook
- notification event

Acceptance:

- duplicate/spam behavior is deliberate
- no PII leaks into logs
- validation tests exist

## Phase 4 — Eligibility application

Implement:

- application submission
- versioned questions
- answer storage
- lead association
- application state machine
- lifecycle events
- internal notification

Acceptance:

- invalid service tier rejected
- invalid form version rejected
- duplicate submission behavior is deliberate
- state transitions are tested

## Phase 5 — Admin authentication + review

Implement:

- staff authentication integration
- staff roles
- admin application list/detail
- accept/reject
- internal notes
- audit log

Do not build a frontend.

Acceptance:

- unauthenticated admin calls rejected
- reviewer cannot access unauthorized actions
- every mutation is audited
- state transitions cannot be bypassed

## Phase 6 — Scheduling

Implement provider adapter.

Recommended initial abstraction:

```ts
interface SchedulingProvider {
  createSchedulingAccess(input: CreateSchedulingAccessInput): Promise<SchedulingAccess>;
  revokeSchedulingAccess(input: RevokeSchedulingAccessInput): Promise<void>;
  getBooking(input: GetBookingInput): Promise<Booking | null>;
  verifyWebhook(request: WebhookRequest): Promise<VerifiedWebhook>;
}
```

Implement one provider.

Acceptance:

- only accepted applications can schedule
- tokens expire
- provider webhooks are signature-verified
- webhook processing is idempotent
- booking updates are reflected internally

## Phase 7 — Notifications

Implement provider abstraction:

```ts
interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
```

Templates:

- new application → internal staff
- accepted → applicant
- rejected → applicant
- meeting booked → applicant/staff
- contact received → internal staff

Do not put provider-specific logic in application services.

## Phase 8 — Funnel analytics

Implement:

- anonymous session events
- funnel aggregates
- source/campaign attribution
- admin funnel endpoint

Acceptance:

- client cannot forge acceptance/revenue events
- analytics cannot expose applicant answers
- aggregation is efficient

## Phase 9 — Hardening

Before production:

- security headers
- strict CORS
- request size limits
- rate limits
- webhook signature verification
- database permission review
- secret review
- dependency audit
- error handling review
- PII logging audit
- backup/restore plan
- retention/deletion plan
- load smoke test
- API contract test
- production Docker image test

## Production readiness checklist

```text
[ ] Environment validation
[ ] HTTPS
[ ] Database backups
[ ] Migration deployment procedure
[ ] Rate limiting
[ ] CORS locked down
[ ] Admin auth
[ ] Audit logging
[ ] Email domain configured
[ ] Scheduling provider configured
[ ] Webhook secrets configured
[ ] Error monitoring
[ ] Health checks
[ ] CI passing
[ ] No secrets in repository
[ ] No real client data in seed data
[ ] Privacy/retention policy decided
```
