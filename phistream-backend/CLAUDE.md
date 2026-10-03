# Phistream Studio Backend — Claude Code Instructions

## Project

Build the production backend for **Phistream Studio**, a social-media/creator consultancy.

This repository is **backend-only**. A separate developer owns the public website/UI. Do not build frontend pages unless explicitly requested.

The backend's primary purpose is to support:

- Public service-tier content
- Public FAQs and testimonials
- Contact submissions
- Social-bio onboarding funnel
- VSL/eligibility application flow
- Application review
- Conditional meeting scheduling
- Email notifications
- Admin APIs for a future admin dashboard
- Conversion/funnel analytics

## Product funnel

Social bio
→ onboarding page
→ VSL
→ eligibility form
→ application submitted
→ internal review
→ accepted/rejected
→ accepted applicant receives scheduling access
→ meeting booked
→ potential client

## Chosen stack

- Node.js 24 LTS
- TypeScript, strict mode
- Fastify 5
- PostgreSQL hosted by Supabase
- Drizzle ORM + drizzle-kit
- Zod for application/domain validation
- `pg`/node-postgres for the PostgreSQL driver
- Resend for transactional email
- Cal.com (or another scheduling provider behind an adapter) for booking
- Vitest for unit/integration tests
- Pino/Fastify logging
- OpenAPI via Fastify Swagger
- Docker for local development
- GitHub Actions for CI

Use stable releases. Do not adopt release candidates/beta packages unless explicitly approved.

## Architectural principles

1. The backend owns business logic. Never trust the frontend for qualification state, pricing, authorization, or booking eligibility.
2. Keep provider-specific code behind adapters:
   - EmailProvider
   - SchedulingProvider
3. Keep the domain layer independent from Fastify where practical.
4. Validate all external input at the API boundary.
5. Never expose internal application answers, notes, lead status, or PII through public endpoints.
6. Never expose service-role/database credentials to the frontend.
7. Public endpoints must be aggressively rate-limited and protected against obvious spam.
8. Every state-changing admin action must be auditable.
9. Use UUIDs for public-facing identifiers.
10. Store timestamps in UTC.
11. Do not hard-code service tiers, FAQs, testimonials, or contact details into route handlers.
12. Do not create authentication for public visitors. Authentication is for future staff/admin access.
13. Do not create a client login merely because a sign-in page was mentioned. There is currently no demonstrated client portal requirement.
14. Do not build a custom calendar engine.
15. Do not build payments in V1 unless the business requirements later explicitly add checkout/payment collection.
16. Prefer simple relational PostgreSQL models over premature microservices.

## Database/security

Supabase provides PostgreSQL. The application connects through a server-side pooled PostgreSQL connection.

The browser should NOT directly access the database.

All application tables containing business/private data must have appropriate database permissions/RLS posture. Public content should be deliberately exposed through backend endpoints, not by opening unrestricted database access.

Never commit:

- `.env`
- API keys
- database URLs
- Supabase service credentials
- email API keys
- scheduling API keys

## Coding standards

- TypeScript strict mode.
- No `any` unless justified with a comment.
- No business logic in route handlers beyond request parsing/delegation.
- Prefer small services with explicit dependencies.
- Use transactions for multi-table state transitions.
- Return consistent JSON error envelopes.
- Use semantic HTTP status codes.
- Add tests for every business-critical state transition.
- Add indexes for fields used in filtering, sorting, uniqueness, and foreign keys.
- Do not silently swallow errors.
- Log useful metadata, never sensitive form answers or secrets.
- Never log full request bodies for eligibility/contact submissions.

## Suggested repository structure

```text
src/
  app.ts
  server.ts
  config/
  db/
    schema/
    migrations/
    seed/
  modules/
    content/
    leads/
    applications/
    scheduling/
    notifications/
    analytics/
    admin/
  plugins/
    auth/
    rate-limit/
    swagger/
  providers/
    email/
    scheduling/
  shared/
    errors/
    validation/
    types/
    utils/
tests/
docs/
```

Keep modules cohesive. Do not create a huge generic `utils.ts`.

## Required developer workflow

Before implementing a feature:

1. Read the relevant docs in `/docs`.
2. Inspect the current codebase.
3. Identify affected database tables/routes/services.
4. Implement the smallest coherent change.
5. Generate/apply migration when schema changes.
6. Add tests.
7. Run typecheck, lint, and tests.
8. Update relevant docs.
9. Report exactly what changed and any remaining decisions.

Do not rewrite working architecture just because another framework could be used.

## Definition of done

A feature is not complete when it merely compiles.

It is complete when:

- Input validation exists.
- Authorization is correct.
- Database constraints exist where appropriate.
- Business rules are enforced server-side.
- Errors are handled consistently.
- Tests cover success and failure paths.
- OpenAPI documentation is updated.
- Logs do not leak sensitive information.
- Migration is reproducible.
- The feature can be exercised by the separate frontend developer.

## Brand reference

Phistream Studio palette:

- `#2B211A` — primary dark surface
- `#F3EFE6` — light background
- `#C89B3C` — primary gold / CTA
- `#A69377` — muted text/dividers
- `#8A6A2A` — hover/active dark gold

The backend itself should not contain UI styling. These values may be exposed through a public configuration/content endpoint only if the frontend needs centralized brand data.

## Important ambiguity

The exact service tiers, pricing, eligibility questions, FAQ entries, testimonials, VSL URL, business contact details, and scheduling rules have not yet been supplied.

Model these as data/configuration. Do not invent business facts.
