# Notifications (email)

Code: `src/providers/email/` (port `email-provider.ts`, adapters `resend.ts` and `log-provider.ts`) and `src/modules/notifications/` (outbox, dispatcher, worker, templates, context, repository).

## How it works

```text
domain transaction ──► notification_events (outbox, PENDING)          no email code in domain modules
worker (every API instance, every NOTIFICATIONS_POLL_INTERVAL_MS)
  claim due events: FOR UPDATE SKIP LOCKED + 5-minute lease            short transaction
  for each event → plan messages (template + recipient)
    notification_deliveries row (unique per event/template/recipient)
    already SENT? skip.  else render → EmailProvider.send(idempotencyKey = delivery id)   no transaction held
    → SENT + provider_message_id   |   FAILED + sanitized error code
  all sent → PROCESSED   |   retry with backoff   |   FAILED (dead letter)
```

- Domain modules only write outbox rows, in the same transaction as their change (Phases 3–6). They never call an email provider.
- The worker runs inside the API process (`NOTIFICATIONS_WORKER_ENABLED`, on by default) and is safe on several instances: events are claimed with leases, and a crashed worker's events are picked up again once its lease expires. It stops before the database pool closes on shutdown.
- **All queue timing uses the database clock.** Due times, leases, backoff, `processed_at` and `sent_at` all come from PostgreSQL `now()`, because outbox rows get database timestamps and app-server clocks may drift.

## Templates

`src/modules/notifications/templates.ts`: pure functions; every value HTML-escaped; subjects single-line; only http(s) links rendered; brand palette from CLAUDE.md; plain-text part always included. The wording is neutral placeholder copy, with no prices or promises. The business can edit it there.

| Outbox event                                     | Template(s)                                                                 | Recipients        |
| ------------------------------------------------ | --------------------------------------------------------------------------- | ----------------- |
| `CONTACT_RECEIVED`                               | `staff.contact_received` (message included; Reply-To = sender)              | staff             |
| `APPLICATION_SUBMITTED`                          | `staff.application_submitted` (dashboard link; **answers are not emailed**) | staff             |
| `APPLICATION_ACCEPTED`                           | `applicant.application_accepted` (**personal scheduling link**, see below)  | applicant         |
| `APPLICATION_REJECTED`                           | `applicant.application_rejected` (never the internal reason)                | applicant         |
| `MEETING_BOOKED` / `_RESCHEDULED` / `_CANCELLED` | `applicant.meeting_*`, `staff.meeting_*`                                    | applicant + staff |
| `SCHEDULING_BOOKING_NEEDS_ATTENTION`             | `staff.scheduling_needs_attention`                                          | staff             |

**Staff recipients:** `STAFF_NOTIFICATION_EMAILS` if set, otherwise every active `ADMIN` staff user. If there is nobody to notify, a staff-only event is dead-lettered with `no_staff_recipients` so the gap is visible. Meeting emails still reach the applicant.

**Acceptance email:** just before sending, the dispatcher issues scheduling access (Phase 6, `issueAccess(applicationId, null)`, audited with a `null` system actor) and includes `SCHEDULING_PAGE_URL#token=…`. The link is only issued when the email is actually about to be sent. If scheduling is not configured, or the application is no longer awaiting a booking, the email goes out without a link ("we'll be in touch").

## Idempotency

- **Enqueue:** one outbox event per (type, subject) (Phase 3).
- **Send:** one delivery row per (event, template, recipient). A retry skips rows already `SENT`. The delivery id is sent as Resend's `Idempotency-Key`, so if the process dies after Resend accepted a message but before the row was updated, the retry does not send a second copy.
- **Known edge case:** if that crash hits the _acceptance_ email, the retry issues a new scheduling token. Resend then replays the original send (or rejects it as a changed payload), so the applicant has the earlier link, which rotation has invalidated. The window is milliseconds. It ends as a visible failed or duplicate notification, and staff can re-issue the link (`POST /admin/applications/:id/scheduling-access`).

## Failures and observability

| What happens                                                                          | Result                                                                                                 |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Transient provider error (429, 5xx, timeout, network, idempotency conflict)           | Event stays `PENDING`, `attempts`+1, retried after 1, 2, 4 … minutes (max 1 hour); `last_error` = code |
| Permanent provider error (401/403/422: bad key, unverified domain, invalid recipient) | Event `FAILED` immediately                                                                             |
| `NOTIFICATIONS_MAX_ATTEMPTS` (default 8) reached                                      | Event `FAILED` (dead letter)                                                                           |
| Subject deleted (retention request)                                                   | Event `PROCESSED`, nothing sent                                                                        |
| No staff recipients / unknown event type                                              | Event `FAILED`                                                                                         |
| Unexpected error (e.g. database)                                                      | Retried as `internal_error`                                                                            |

Other recipients of the same event are still served when one delivery fails.

**Where to look:**

- **Admin API (ADMIN only):**
  - `GET /api/v1/admin/notifications?status=FAILED` lists events with their deliveries and error codes.
  - `POST /api/v1/admin/notifications/:id/retry` requeues a `FAILED` event (attempts reset; sent deliveries are not re-sent; audited as `notification.requeued`).
- **Logs** (JSON, `module: "notifications"`): `notification sent` (info), `notification delivery failed` and `notification will be retried` (warn), `notification permanently failed` (**error**; alert on this). Log lines carry ids, template ids, error codes and provider message ids, and **never** recipients, subjects or bodies.
- **SQL:** `select event_type, count(*) from notification_events where status = 'FAILED' group by 1;`

Error codes are built by the adapter from the HTTP status and Resend's error _name_, e.g. `resend_422_validation_error`. Provider error _messages_ can quote addresses, so they are never stored or logged.

## Configuration

| Variable                         | Default                           | Notes                                                                                                |
| -------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `EMAIL_PROVIDER`                 | resend if configured, else `log`  | `resend` or `log`. **Production:** must be `resend` (key + sender) or explicitly `log`               |
| `RESEND_API_KEY`                 | none                              | Secret. Create a key with **sending access only**. Used only in the `Authorization` header to Resend |
| `EMAIL_FROM`                     | none (`log`: `…@example.invalid`) | `Phistream Studio <hello@mail.your-domain>`: the domain must be **verified in Resend**               |
| `EMAIL_REPLY_TO`                 | none                              | Default Reply-To (contact notifications reply to the sender instead)                                 |
| `RESEND_API_BASE_URL`            | `https://api.resend.com`          |                                                                                                      |
| `STAFF_NOTIFICATION_EMAILS`      | active ADMIN staff                | Comma-separated                                                                                      |
| `ADMIN_DASHBOARD_URL`            | none                              | Adds "Open application" links to staff emails (`<url>/applications/<id>`)                            |
| `SCHEDULING_PAGE_URL`            | none                              | Needed for the scheduling link in acceptance emails ([scheduling.md](scheduling.md))                 |
| `NOTIFICATIONS_WORKER_ENABLED`   | `true`                            | Set `false` to run no worker on this instance                                                        |
| `NOTIFICATIONS_POLL_INTERVAL_MS` | `15000`                           | Idle polling interval; backlogs are drained back to back                                             |
| `NOTIFICATIONS_BATCH_SIZE`       | `10`                              |                                                                                                      |
| `NOTIFICATIONS_MAX_ATTEMPTS`     | `8`                               | About 4 hours of retries with the default backoff                                                    |

### Resend setup

1. Add and verify the sending domain in Resend (DNS records). A subdomain such as `mail.<domain>` keeps marketing and transactional reputation apart.
2. Create an API key with **sending access**, and store it as `RESEND_API_KEY` in the host's secret store.
3. Set `EMAIL_FROM` to an address on the verified domain.
4. Check: submit a contact form, then look at `GET /admin/notifications`. The delivery should be `SENT` with a provider message id.

### Local development

Without Resend settings, the **log provider** is used: nothing is sent, messages are kept in memory, and only metadata is logged. Deliveries are still recorded with provider `log`, so the whole pipeline can be exercised.

## Privacy

- Deliveries store recipient addresses, template ids and provider message ids, and **never** bodies.
- Staff emails deliberately exclude application answers. The contact notification includes the message, because that is its purpose.
- Deleting a lead does not delete its past `notification_deliveries` rows (they reference events, not leads). Include them in the retention/deletion procedure (Phase 9).
