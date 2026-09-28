# Phistream Studio Data Model

This is the initial relational model. Exact eligibility questions and service tiers must be supplied by the business and must not be invented by the implementation agent.

## Core entities

```text
service_tiers
faqs
testimonials
site_config

leads
applications
application_answers
application_events
application_notes

scheduling_sessions
meetings

analytics_events

staff_users
audit_logs

notification_deliveries
```

## service_tiers

Purpose: public service packages.

Fields:

- id UUID PK
- slug TEXT UNIQUE
- name TEXT
- description TEXT
- price_amount INTEGER/DECIMAL
- currency TEXT
- billing_period TEXT nullable
- display_order INTEGER
- is_active BOOLEAN
- features JSONB
- created_at
- updated_at

Do not assume currency or billing period until supplied.

## faqs

- id UUID PK
- question TEXT
- answer TEXT
- display_order INTEGER
- is_active BOOLEAN
- created_at
- updated_at

## testimonials

- id UUID PK
- name TEXT
- role TEXT nullable
- company TEXT nullable
- quote TEXT
- avatar_url TEXT nullable
- display_order INTEGER
- is_active BOOLEAN
- created_at
- updated_at

Only store information the business has permission to publish.

## site_config

Use a small key/value or typed configuration model.

Examples:

- VSL URL
- business email
- phone
- social links
- onboarding headline
- brand metadata

Avoid turning this into an unstructured CMS blob for everything.

## leads

Represents a person/business that has entered the funnel.

Fields:

- id UUID PK
- email TEXT
- full_name TEXT
- phone TEXT nullable
- company_name TEXT nullable
- source TEXT nullable
- campaign TEXT nullable
- landing_path TEXT nullable
- status TEXT
- created_at
- updated_at

Suggested lead statuses:

- NEW
- CONTACTED
- QUALIFIED
- CONVERTED
- LOST
- ARCHIVED

Email should have a suitable index and uniqueness strategy based on the business workflow. Do not assume one email can only ever have one lead without confirming the business rules.

## applications

Represents a submitted eligibility application.

Fields:

- id UUID PK
- lead_id UUID FK
- service_tier_id UUID nullable FK
- status TEXT
- submitted_at
- reviewed_at nullable
- reviewed_by nullable
- rejection_reason nullable
- accepted_at nullable
- created_at
- updated_at

Suggested status enum:

- NEW
- UNDER_REVIEW
- ACCEPTED
- REJECTED
- WITHDRAWN
- ARCHIVED

Keep the application itself separate from the lead because one lead may apply more than once.

## application_answers

Do not create a new database column for every question.

Fields:

- id UUID PK
- application_id UUID FK
- question_key TEXT
- answer JSONB
- created_at

This makes the form versionable and prevents schema churn whenever the agency changes an eligibility question.

Also store an `application_form_version` on the application.

## application_notes

Internal-only.

- id UUID PK
- application_id UUID FK
- author_id UUID FK
- body TEXT
- created_at

Never return this through public endpoints.

## application_events

Business audit trail for application lifecycle.

- id UUID PK
- application_id UUID FK
- event_type TEXT
- actor_type TEXT
- actor_id UUID nullable
- metadata JSONB
- created_at

Examples:

- SUBMITTED
- REVIEW_STARTED
- ACCEPTED
- REJECTED
- SCHEDULING_ENABLED
- BOOKING_CREATED
- WITHDRAWN

## scheduling_sessions

- id UUID PK
- application_id UUID FK UNIQUE
- token_hash TEXT nullable
- expires_at TIMESTAMPTZ nullable
- used_at TIMESTAMPTZ nullable
- provider TEXT
- provider_reference TEXT nullable
- created_at

The raw access token should not be stored.

## meetings

- id UUID PK
- application_id UUID FK
- provider TEXT
- provider_event_id TEXT UNIQUE nullable
- starts_at TIMESTAMPTZ
- ends_at TIMESTAMPTZ
- status TEXT
- meeting_url TEXT nullable
- created_at
- updated_at

Suggested statuses:

- SCHEDULED
- CANCELLED
- RESCHEDULED
- COMPLETED
- NO_SHOW

## analytics_events

Keep this deliberately minimal.

- id UUID PK
- event_name TEXT
- anonymous_session_id TEXT
- application_id UUID nullable
- source TEXT nullable
- campaign TEXT nullable
- path TEXT nullable
- metadata JSONB nullable
- created_at

Do not store arbitrary personal data inside metadata.

## staff_users

Initial staff model can be deliberately small.

- id UUID PK
- auth_provider_id TEXT UNIQUE
- email TEXT UNIQUE
- display_name TEXT
- role TEXT
- is_active BOOLEAN
- created_at
- updated_at

Suggested roles:

- ADMIN
- REVIEWER

Do not build granular RBAC until needed.

## audit_logs

- id UUID PK
- actor_id UUID nullable
- action TEXT
- entity_type TEXT
- entity_id UUID nullable
- metadata JSONB nullable
- created_at

Record security-sensitive administrative actions.

## notification_deliveries

- id UUID PK
- event_type TEXT
- recipient TEXT
- provider TEXT
- provider_message_id TEXT nullable
- status TEXT
- attempts INTEGER
- last_error TEXT nullable
- sent_at TIMESTAMPTZ nullable
- created_at
- updated_at

Do not store full email bodies unless there is a demonstrated compliance/debugging requirement.

## Indexing

At minimum index:

- leads.email
- leads.status
- leads.created_at
- applications.status
- applications.created_at
- applications.lead_id
- applications.service_tier_id
- application_answers.application_id
- application_events.application_id
- scheduling_sessions.application_id
- scheduling_sessions.expires_at
- meetings.application_id
- meetings.starts_at
- analytics_events.event_name
- analytics_events.created_at

Use partial/compound indexes where query patterns justify them.

## Privacy

Eligibility applications can contain sensitive business information.

Rules:

- Minimize collection.
- Do not log raw submissions.
- Do not expose answers publicly.
- Encrypt transport.
- Restrict staff access.
- Add retention/deletion capability.
- Do not collect government IDs, passwords, payment credentials, or unrelated sensitive information.
