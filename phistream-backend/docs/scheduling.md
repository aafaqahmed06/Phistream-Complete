# Scheduling

The public contract is in [API_SPEC.md](../API_SPEC.md#scheduling). This page covers the design, provider setup, and operations.

We don't run a calendar. The provider (Cal.com) owns availability and bookings. The backend decides **who may book** and records **what a booking means** for an application.

Code: `src/providers/scheduling/` (port `scheduling-provider.ts`, adapters `calcom.ts` and `mock.ts`), `src/modules/scheduling/` (domain, repository, routes).

## Flow

```text
staff accept ─► application SCHEDULING_OPEN (Phase 5)
staff/worker ─► POST /admin/applications/:id/scheduling-access     → token (shown once; only its hash stored)
applicant    ─► opens  SCHEDULING_PAGE_URL#token=…                   (fragment: never sent to any server)
frontend     ─► GET /scheduling/session  Authorization: Bearer token → schedulingUrl (Cal.com page + booking ref)
applicant    ─► books on Cal.com
Cal.com      ─► POST /webhooks/scheduling/calcom (signed)            → meeting + application SCHEDULED
```

## Eligibility

Only applications in **`SCHEDULING_OPEN`** (accepted, no active booking) can:

- be issued a token (`409` otherwise: NEW, UNDER_REVIEW, REJECTED, WITHDRAWN, SCHEDULED, …);
- resolve a token to the booking page (`404` otherwise);
- have a booking linked by webhook (otherwise the webhook outcome is `NOT_ELIGIBLE` and staff are notified).

## Tokens and booking references

| Secret            | Who holds it                                                | Stored as                                        |
| ----------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| Scheduling token  | Applicant (link from staff/email)                           | `scheduling_sessions.token_hash` (SHA-256)       |
| Booking reference | Applicant's booking URL and the provider's booking metadata | `scheduling_sessions.booking_ref_hash` (SHA-256) |

- Tokens are 256-bit random values. They expire after `SCHEDULING_TOKEN_TTL_HOURS` (default 72) and are **consumed** when a booking is linked. Re-issuing rotates the token and the reference, so the old link and old reference stop working. A cancelled booking makes an unexpired link usable again.
- The booking reference is derived one-way from the token (`SHA-256("phistream:booking-ref:" + token)`). The backend can rebuild it whenever the applicant presents the token, so the raw value is never stored, and knowing the reference doesn't reveal the token.
- Tokens are only accepted in the `Authorization` header, never in paths or query strings (those end up in access logs). The scheduling page receives the token in its URL **fragment**.
- Tokens, references and webhook payloads (which contain attendee names and emails) are never logged. Webhook payloads are not stored.

## Webhooks

`POST /api/v1/webhooks/scheduling/{provider}`. The route has its own raw-body parser: the adapter verifies the signature over the **exact bytes received**, before parsing.

In **one transaction**:

1. Insert `scheduling_webhook_events (provider, provider_event_id)`. A duplicate id is a no-op that still returns `200`.
2. Link and lock: find the application (by booking reference hash, or by the known booking id for reschedules and cancellations) and lock its row.
3. Apply the event (below), then record the outcome.

If anything fails, the whole transaction rolls back, including the dedup row. The provider's retry is then processed normally.

| Event       | Effect                                                                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| created     | meeting `SCHEDULED`; application SCHEDULING_OPEN → **SCHEDULED** (`BOOKING_CREATED`, actor PROVIDER); token consumed; outbox `MEETING_BOOKED`      |
| rescheduled | previous meeting `RESCHEDULED`, new meeting `SCHEDULED`; application stays SCHEDULED; event `BOOKING_RESCHEDULED`; outbox `MEETING_RESCHEDULED`    |
| cancelled   | meeting `CANCELLED`; application SCHEDULED → **SCHEDULING_OPEN** (`BOOKING_CANCELLED`) so the applicant can book again; outbox `MEETING_CANCELLED` |
| other types | recorded as `IGNORED`                                                                                                                              |

Outcomes (`scheduling_webhook_events.outcome`):

- `PROCESSED`
- `IGNORED`: an unused event type, or the same booking delivered again under another event id
- `UNMATCHED`: no valid booking reference, or an unknown booking
- `NOT_ELIGIBLE`: the application may not schedule

`UNMATCHED` bookings and `NOT_ELIGIBLE` bookings raise an outbox event `SCHEDULING_BOOKING_NEEDS_ATTENTION` (subject: the webhook event), so staff can cancel the booking in Cal.com. The exception is an unmatched _cancellation_, which needs no action.

| Response | Meaning                                                                |
| -------- | ---------------------------------------------------------------------- |
| `200`    | accepted (including duplicates, ignored events and unmatched bookings) |
| `401`    | bad or missing signature                                               |
| `400`    | signed but unrecognized payload                                        |
| `404`    | provider not configured                                                |
| `5xx`    | failure; nothing recorded, so the provider should retry                |

## Configuration

Scheduling is **disabled** unless `SCHEDULING_PROVIDER` is set. While disabled, the endpoints answer `503` and webhooks are refused.

| Variable                         | Required                      | Notes                                                                                                    |
| -------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `SCHEDULING_PROVIDER`            | to enable                     | `calcom` or `mock` (`mock` is refused in production)                                                     |
| `SCHEDULING_TOKEN_TTL_HOURS`     | no (`72`)                     | 1–720                                                                                                    |
| `SCHEDULING_PAGE_URL`            | recommended                   | Frontend page that reads `#token=` (https in production). Used to build links for staff and emails       |
| `CALCOM_BOOKING_URL`             | with `calcom`                 | Booking page of the event type, e.g. `https://cal.com/<team-or-user>/<event-slug>` (https in production) |
| `CALCOM_WEBHOOK_SECRET`          | with `calcom`                 | The secret entered on the Cal.com webhook (≥ 16 chars)                                                   |
| `CALCOM_API_KEY`                 | for booking lookup            | Cal.com API key, used server-side only by `GET /admin/applications/:id/booking` (`503` without it)       |
| `CALCOM_API_BASE_URL`            | no (`https://api.cal.com/v2`) | Change only for self-hosted Cal.com                                                                      |
| `CALCOM_API_VERSION`             | no (`2024-08-13`)             | Sent as the `cal-api-version` header                                                                     |
| `MOCK_SCHEDULING_WEBHOOK_SECRET` | with `mock`                   | Any ≥ 16-char string (development only)                                                                  |

No credentials are committed or invented. The Cal.com values must come from the business's Cal.com account and go into the host's secret store. None of them are ever sent to the frontend: the browser only receives the public booking URL, and only after presenting a valid token.

## Cal.com setup

1. **Event type:** create the intro-call event type and set it to **hidden**, so it isn't listed on the public profile. Copy its URL into `CALCOM_BOOKING_URL`. Consider enabling "requires confirmation" as an extra guard (see Limitations).
2. **Webhook:** Settings → Developer → Webhooks → New.
   - Subscriber URL: `https://<api-host>/api/v1/webhooks/scheduling/calcom`
   - Triggers: _Booking created_, _Booking rescheduled_, _Booking cancelled_ (and _Booking rejected_ if you use confirmations)
   - Secret: a long random value, also set as `CALCOM_WEBHOOK_SECRET`
3. **API key** (optional, for booking lookup): Settings → Developer → API keys, then set `CALCOM_API_KEY`.
4. **Verify before go-live:** make a test booking through a link issued by the backend, and check that the webhook outcome is `PROCESSED` and a meeting row exists.

The adapter follows Cal.com's documented formats:

- signature header `X-Cal-Signature-256` (hex HMAC-SHA256 of the body);
- body `{ triggerEvent, payload }` with `uid`, `startTime`, `endTime`, `metadata`, `rescheduleUid`;
- booking metadata prefilled via `metadata[phistreamRef]=` in the booking URL;
- v2 `GET /bookings/{uid}` for lookup.

It has been tested against those formats, not against a live Cal.com account. If your account differs, adjust `calcom.ts` only; the domain is unaffected.

## Local development with the mock provider

```bash
SCHEDULING_PROVIDER=mock
MOCK_SCHEDULING_WEBHOOK_SECRET=local-dev-secret-change-me
SCHEDULING_PAGE_URL=http://localhost:5173/schedule
```

Scheduling URLs point at `https://scheduling.mock.invalid/book?ref=…`, which never resolves. Simulate the provider by posting a signed webhook:

```bash
BODY='{"id":"evt-1","type":"BOOKING_CREATED","bookingRef":"<ref from the scheduling URL>","booking":{"id":"bk-1","startsAt":"2026-07-01T15:00:00Z","endsAt":"2026-07-01T15:30:00Z","meetingUrl":"https://meet.example.com/x"}}'
SIG=$(node -e "process.stdout.write(require('crypto').createHmac('sha256', process.argv[1]).update(process.argv[2]).digest('hex'))" "$MOCK_SCHEDULING_WEBHOOK_SECRET" "$BODY")
curl -X POST http://localhost:3000/api/v1/webhooks/scheduling/mock \
  -H 'content-type: application/json' -H "x-mock-signature: $SIG" -d "$BODY"
```

Other mock types: `BOOKING_RESCHEDULED` (`booking`, `previousBookingId`, `bookingRef`), `BOOKING_CANCELLED` (`bookingId`), `PING`.

## Adding another provider

Implement `SchedulingProvider` in `src/providers/scheduling/<name>.ts`, add its config to `src/config/env.ts` and `providers/scheduling/index.ts`, and point its webhook at `/api/v1/webhooks/scheduling/<name>`. A provider that supports single-use booking links can create them in `createSchedulingAccess` and invalidate them in `revokeSchedulingAccess`, keyed by `sessionId`. The domain already calls `revokeSchedulingAccess` after a re-issue.

## Limitations and decisions

- **Cal.com page URL:** the event-type page is not unique per applicant. Anyone who obtains the URL can book, but such a booking carries no valid reference, so it is **not linked** and staff are alerted (`UNMATCHED`). To stop those bookings at the source, enable "requires confirmation" or use Cal.com private links. The adapter can support the latter behind the same port.
- **Delivery of the link:** the acceptance email (Phase 7) issues the link automatically and includes it. Staff can re-issue a link from the admin API, e.g. after expiry.
- **Staff alerts:** `SCHEDULING_BOOKING_NEEDS_ATTENTION` events are emailed to staff by the notification worker ([notifications.md](notifications.md)).
- **Completion:** meeting completion and no-shows (`COMPLETED` / `NO_SHOW`) are staff transitions without an endpoint yet.
