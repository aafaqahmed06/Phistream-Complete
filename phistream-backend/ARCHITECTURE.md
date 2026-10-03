# Phistream Studio Backend Architecture

## 1. Objective

Phistream Studio needs a backend that behaves less like a brochure-site API and more like a lightweight **lead qualification and conversion system**.

The public website is owned by another developer.

The backend must support this funnel:

```text
Social bio
    ↓
Onboarding
    ↓
VSL
    ↓
Eligibility application
    ↓
Application review
    ├── rejected / follow-up
    └── accepted
             ↓
        Scheduling access
             ↓
        Meeting booked
             ↓
          Sales process
             ↓
           Client
```

## 2. Architecture

```text
                    ┌─────────────────────┐
                    │  Public Website UI  │
                    └──────────┬──────────┘
                               │ HTTPS/JSON
                               ▼
                    ┌─────────────────────┐
                    │  Fastify API        │
                    │  TypeScript         │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
       ┌────────────┐   ┌──────────────┐  ┌───────────────┐
       │ PostgreSQL │   │ Email Adapter│  │ Scheduling    │
       │ Supabase   │   │ Resend       │  │ Adapter       │
       └────────────┘   └──────────────┘  │ Cal.com etc.  │
                                           └───────────────┘
```

Future:

```text
Staff/Admin UI
      │
      ▼
Admin API
      │
      ▼
same domain services/database
```

## 3. Why this stack

### Fastify + TypeScript

The API is small enough that a full enterprise framework would add unnecessary ceremony, while Fastify provides a strong plugin model, TypeScript support, validation/serialization capabilities, and good performance.

Fastify's TypeScript documentation supports typed schemas/type providers and its plugin architecture is well suited to modular APIs.

### Supabase PostgreSQL

Use Supabase as the managed PostgreSQL layer rather than using Supabase as the browser-facing backend.

This gives:

- Managed PostgreSQL
- Backups/operations
- Connection pooling
- Familiar tooling
- A straightforward path to future Supabase Auth if staff authentication is needed

The application server remains the security boundary.

### Drizzle

Use Drizzle because the backend is TypeScript-first and the project benefits from a direct, explicit relational schema with SQL migrations.

Use generated SQL migrations for production. Do not use schema push as the production deployment mechanism.

### Resend

Use a provider adapter for transactional email. Resend is the initial implementation, but domain code must not depend directly on the Resend SDK.

### Scheduling provider

Do not build scheduling.

Create a `SchedulingProvider` interface and initially implement Cal.com or the provider selected by the business.

The backend should control whether an applicant is eligible to receive scheduling access. The scheduling provider should handle calendar availability and booking.

## 4. Module boundaries

### content

Owns:

- service tiers
- FAQs
- testimonials
- public site configuration
- onboarding configuration/VSL metadata

Public content is read-only from the public API.

### leads

Owns:

- contact submissions
- lead identity
- acquisition/source information
- lifecycle metadata

### applications

Owns:

- eligibility applications
- application answers
- application status
- review decisions
- internal notes
- acceptance/rejection events

This is the core business module.

### scheduling

Owns:

- scheduling eligibility
- booking tokens/session state
- provider webhooks
- meeting records

### notifications

Owns:

- email events
- templates
- delivery attempts/status
- notification preferences if introduced later

### analytics

Owns:

- anonymous funnel events
- source attribution
- application funnel metrics

Do not store unnecessary invasive visitor data.

### admin

Owns:

- staff authorization
- admin actions
- audit log
- application review endpoints
- content management endpoints

## 5. Public API vs admin API

### Public

Unauthenticated:

- GET public content
- POST contact
- POST application
- POST funnel events
- GET scheduling eligibility/status where appropriate

These endpoints are rate-limited.

### Admin

Authenticated:

- list/filter leads
- view application
- accept/reject application
- add internal notes
- view audit log
- manage content
- view funnel metrics
- manage service tiers/FAQs/testimonials

Do not expose admin endpoints to unauthenticated callers.

## 6. Application state machine

Use explicit states.

```text
NEW
  ↓
UNDER_REVIEW
  ├──────────────→ REJECTED
  │
  └──────────────→ ACCEPTED
                         ↓
                  SCHEDULING_OPEN
                         ↓
                    SCHEDULED
                         ↓
                    COMPLETED
                         ↓
                    CONVERTED
```

Allow operational states such as:

- WITHDRAWN
- ARCHIVED
- NO_SHOW

Do not allow arbitrary status strings.

Every transition must be validated server-side.

## 7. Booking security

Never expose a permanent "secret booking URL" to every visitor.

When an application is accepted:

1. Create or enable a scheduling session.
2. Generate a short-lived signed token or opaque random token.
3. Store only a secure hash of the token if possible.
4. Give the frontend a one-time/short-lived scheduling access mechanism.
5. Verify the application is accepted and not already completed/withdrawn.
6. Create or retrieve the booking through the scheduling provider.
7. Process provider webhook events idempotently.

The exact provider flow depends on the selected scheduling service.

## 8. Analytics

At minimum track:

- `onboarding_view`
- `vsl_start`
- `vsl_25`
- `vsl_50`
- `vsl_75`
- `vsl_complete`
- `application_start`
- `application_submit`
- `application_accepted`
- `application_rejected`
- `scheduling_opened`
- `meeting_booked`

Every event should support:

- anonymous session ID
- source
- campaign
- referrer where available
- timestamp
- optional application ID after submission

Do not use IP addresses as a permanent visitor identifier.

## 9. Deployment

Recommended initial deployment:

```text
GitHub
   ↓
GitHub Actions
   ↓
Docker image
   ↓
Managed Node container host
   ↓
Supabase PostgreSQL
```

A simple managed container host is preferable to prematurely splitting the API into serverless functions.

Keep the application stateless so horizontal scaling remains possible.

## 10. Non-goals for V1

Do not build:

- Client portal
- Public user accounts
- Custom calendar
- Custom video hosting
- Payment processing
- Full CRM
- Marketing automation platform
- Chat system
- Microservice architecture
- AI qualification
- Complex role hierarchy

These can be added after actual business usage establishes the need.
