# Phistream Studio — Backend Stack Decision

## Decision

Use:

| Layer      | Choice                                         |
| ---------- | ---------------------------------------------- |
| Runtime    | Node.js 24 LTS                                 |
| Language   | TypeScript                                     |
| HTTP       | Fastify 5                                      |
| Database   | PostgreSQL via Supabase                        |
| ORM        | Drizzle ORM                                    |
| Validation | Zod                                            |
| Auth       | Supabase Auth for staff/admin only             |
| Email      | Resend behind an adapter                       |
| Scheduling | Cal.com or selected provider behind an adapter |
| Tests      | Vitest                                         |
| Logging    | Pino                                           |
| API docs   | OpenAPI / Fastify Swagger                      |
| Deployment | Docker + managed container host                |
| CI         | GitHub Actions                                 |

## Why not Next.js API routes?

The UI is being built separately. A standalone backend creates a clean ownership boundary and avoids coupling the agency's business logic to the frontend framework.

## Why not Supabase as the entire backend?

Supabase is excellent for PostgreSQL, authentication, and managed infrastructure, but Phistream has actual business workflow logic: application state transitions, staff review, scheduling eligibility, notifications, audit logs, and provider webhooks.

Keep that domain logic in a real application server.

## Why not microservices?

The business does not currently have the scale or operational complexity that justifies multiple deployable services.

A modular monolith gives:

- one deployment
- one database
- clear domain boundaries
- simpler debugging
- simpler local development
- a clean path to split services later if evidence demands it

## Why Drizzle instead of Prisma?

The backend is TypeScript-first and relatively SQL-shaped. Drizzle provides explicit PostgreSQL schemas and SQL migration workflows without introducing a large generated client/runtime abstraction.

Prisma remains a viable alternative, but the current Prisma release line includes newer contract/migration workflows and an ORM 8 release candidate. For this project, avoiding unnecessary framework churn is preferable.

## Why Fastify?

The backend needs a focused HTTP API, not a frontend framework. Fastify provides TypeScript support, schema validation/serialization, plugins, and a small runtime surface.

## Current official documentation consulted

- Supabase RLS/security and database connection guidance
- Fastify TypeScript documentation
- Drizzle PostgreSQL/Supabase/migration documentation

The implementation should pin compatible stable package versions rather than blindly installing latest packages.
