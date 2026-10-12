# Attio CRM sync

One-way sync, Phistream → Attio. Off unless `ATTIO_API_KEY` is set.

## What is synced

| Phistream event                                                        | Attio                                                                                          |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Contact message                                                        | Person (matched on email) + a note with the message, company, source, campaign                 |
| Application submitted                                                  | Person + Deal (matched on `phistream_reference` = application reference) + a note with answers |
| Any later lifecycle event (review, accept, reject, booking, cancel, …) | Deal stage updated to the stage mapped from the application's **current** status               |

Never sent: staff notes, rejection reasons, access tokens.

## Attio workspace setup

1. Create an API key with record read/write and note read/write scopes.
2. On the **Deals** object add a text attribute with API slug `phistream_reference` and mark it **unique**.
3. Make sure a workspace member exists for `ATTIO_DEAL_OWNER_EMAIL` (Attio requires a deal owner).
4. Create deal stages; map them with `ATTIO_STAGE_MAP` (JSON, application status → stage title). Unmapped statuses use Attio's default pipeline titles (`NEW`→Lead, `UNDER_REVIEW`/`ACCEPTED`/`SCHEDULING_OPEN`/`SCHEDULED`/`COMPLETED`→In Progress, `CONVERTED`→Won 🎉, `REJECTED`/`WITHDRAWN`/`ARCHIVED`/`NO_SHOW`→Lost).

## How it runs

Sync events (`CRM_CONTACT_SYNC`, `CRM_APPLICATION_SYNC`) are rows in the same transactional outbox as email (`notification_events`), written in the same transaction as the lead or lifecycle event. The dispatcher reads current state and upserts to Attio, with the same retry/backoff and dead-letter behaviour as email. Upserts are idempotent, so retries never duplicate people or deals.

Admin → **CRM** (`GET /admin/notifications?kind=crm`) lists them; failed ones can be retried. `lastError` is a sanitized code, e.g. `attio_400_validation_type` (bad stage/attribute), `attio_401` (bad key).

## Erasure

`DELETE /admin/leads/:id` deletes the person and the deals in Attio first. If Attio is unreachable it answers 503 and deletes nothing, so the request can be repeated.

## Known limits

- Multi-value attributes (emails, phones) are overwritten on each upsert; extra values added by hand in Attio are lost.
- A note is created per event; a crash after Attio accepted the note but before the event was marked done can duplicate it.
- No backfill of leads that existed before the key was set.
