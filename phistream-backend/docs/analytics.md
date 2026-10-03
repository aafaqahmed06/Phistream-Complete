# Funnel analytics

The public contract is in [API_SPEC.md](../API_SPEC.md#analytics). Code: `src/modules/analytics/`.

## Principles

1. **The browser reports behaviour, never outcomes.** Only these events are accepted: `onboarding_view`, `vsl_start`, `vsl_25`, `vsl_50`, `vsl_75`, `vsl_complete`, `application_start`, `application_submit`, `scheduling_opened`. Anything else, including `application_accepted`, `application_rejected` and `meeting_booked`, gets `400` and is not stored.
2. **Outcomes come from authoritative records.** Applications, acceptances, rejections and bookings are counted from the `applications` and `meetings` tables, never from `analytics_events`. Even a row forged directly into `analytics_events` cannot change them (tested).
3. **Minimal visitor data.** No cookies, IP addresses, user agents, device fingerprints or free-form metadata.

## What is stored per event

| Field                | Stored as                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `event`              | One of the nine client events                                                                  |
| `anonymousSessionId` | As sent: a random per-visit id (8–128 chars `[A-Za-z0-9_-]`)                                   |
| `source`, `campaign` | Lower-cased attribution codes (e.g. `utm_source`, `utm_campaign`)                              |
| `path`               | **Pathname only**: the query string and fragment are removed (they can carry emails or tokens) |
| `referrer`           | **Origin only** (e.g. `https://l.instagram.com`)                                               |
| `created_at`         | Database time                                                                                  |

The following are **not stored**: IP address (used in memory for rate limiting only), user agent, cookies, or any other field. Unknown fields get `400`.

## Frontend integration

```js
// One random id per browser tab visit: not persistent, not derived from the person or device.
const sessionId =
  sessionStorage.getItem('phi_sid') ??
  (sessionStorage.setItem('phi_sid', crypto.randomUUID()), sessionStorage.getItem('phi_sid'));

const params = new URLSearchParams(location.search);
function track(event) {
  const body = JSON.stringify({
    event,
    anonymousSessionId: sessionId,
    source: params.get('utm_source') ?? undefined,
    campaign: params.get('utm_campaign') ?? undefined,
    path: location.pathname,
    referrer: document.referrer || undefined,
  });
  // text/plain is accepted, so sendBeacon needs no CORS preflight and survives page unload.
  navigator.sendBeacon('https://<api-host>/api/v1/analytics/events', body);
}

track('onboarding_view');
// VSL player: vsl_start, then vsl_25 / vsl_50 / vsl_75 / vsl_complete once each per visit.
```

Suggested moments to send each event:

- `application_start`: first interaction with the form
- `application_submit`: after a `201`
- `scheduling_opened`: the scheduling page, after `GET /scheduling/session` succeeds

Sending an event twice is harmless: the funnel counts **distinct sessions**.

Rate limit: `ANALYTICS_RATE_LIMIT_MAX` per `ANALYTICS_RATE_LIMIT_WINDOW_MS` per IP (default 120/minute). Body limit: 4 KiB.

> Privacy notice: although no cookies or personal data are used, describe this anonymous measurement in the site's privacy notice. Consent requirements depend on jurisdiction and are a business/legal decision.

## The funnel (`GET /admin/analytics/funnel`, ADMIN)

Period `[from, to)`: default the last 30 days, ending at database time; maximum 366 days. Filters: `source`, `campaign`.

| Stage               | Basis         | Definition                                                                      |
| ------------------- | ------------- | ------------------------------------------------------------------------------- |
| `onboardingViews`   | client        | distinct sessions with `onboarding_view` in the period                          |
| `vslStarts`         | client        | distinct sessions with `vsl_start`                                              |
| `vslCompletes`      | client        | distinct sessions with `vsl_complete`                                           |
| `applicationStarts` | client        | distinct sessions with `application_start`                                      |
| `applications`      | authoritative | applications **submitted** in the period (the cohort)                           |
| `accepted`          | authoritative | of the cohort: `accepted_at` set (stays counted if later withdrawn or archived) |
| `rejected`          | authoritative | of the cohort: reviewed without acceptance (stays counted if later archived)    |
| `meetingsBooked`    | authoritative | of the cohort: at least one meeting was ever booked (even if later cancelled)   |

Ratios are computed on the server and rounded to 4 decimals. A ratio is `null` when its denominator is 0.

| Ratio                       | Formula                          |
| --------------------------- | -------------------------------- |
| `vslStartRate`              | vslStarts / onboardingViews      |
| `vslCompletionRate`         | vslCompletes / vslStarts         |
| `applicationRate`           | applications / onboardingViews   |
| `applicationCompletionRate` | applications / applicationStarts |
| `acceptanceRate`            | accepted / (accepted + rejected) |
| `bookingRate`               | meetingsBooked / accepted        |
| `overallRate`               | meetingsBooked / onboardingViews |

The report also includes:

- `vslProgress`: distinct sessions reaching 25/50/75/100 %.
- `clientReported`: `applicationSubmits` and `schedulingOpened`. These are informational; the funnel uses authoritative applications.
- `bySource`: up to 50 sources, with client and authoritative counts side by side.

**Reading ratios across bases:** client stages count anonymous sessions; authoritative stages count applications. They are different units: one person can use several sessions, and people who blocked the beacon aren't counted. So ratios such as `applicationRate` are indicative, not exact. Outcome ratios (`acceptanceRate`, `bookingRate`) are exact.

**Cohort semantics:** outcomes belong to the period in which the application was **submitted**. A report for last week keeps changing as those applications are reviewed. That is intended: it answers "how did last week's applicants convert".

## Attribution

- Events carry the `source`/`campaign` of the visit.
- Applications carry their own `source`/`campaign` from the submission (Phase 8 columns). The lead keeps its **first touch**, and each application records **the touch that produced it**. Pre-existing applications were backfilled from their lead (migration 0006).
- Filtering by `source` or `campaign` applies to both bases.

## Efficiency

- Client counts use one aggregate query with `FILTER` clauses over the period (`analytics_events_created_at_idx`, `(event_name, created_at)`).
- Cohort counts use `applications_submitted_at_idx` / `(source, submitted_at)`.
- Four queries per report run in parallel.
- At high event volumes, add a periodic roll-up table.

## Retention

Anonymous events contain no personal data, but they don't need to live forever. A retention period (for example 13 months, deleting older `analytics_events`) should be set in Phase 9. Deleting a lead unlinks (`SET NULL`) any event linked to its applications.
