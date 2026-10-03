# Admin API and staff authentication

The public contract is in [API_SPEC.md](../API_SPEC.md#admin-api). This page covers setup and the security model.

Code: `src/providers/auth/` (token verification), `src/plugins/auth/staff-auth.ts` (middleware), `src/modules/admin/` (permissions, audit log, staff mapping, read models, routes), `src/modules/applications/application-review.service.ts` (review actions).

There is no public-user authentication. Only staff sign in.

## How a request is authenticated

```text
Authorization: Bearer <Supabase access token>
  → rate limit (global, per IP)
  → verify JWT: signature (JWKS or legacy secret), alg allow-list, iss, aud, exp, role=authenticated   ✗ 401
  → staff_users row with auth_provider_id = sub AND is_active                                           ✗ 403
  → route permission for the staff role                                                                ✗ 403
  → handler
```

- Authentication runs in `onRequest`, before the body is parsed or validated, so unauthenticated callers can't probe the payload rules.
- **Authorization never trusts token claims.** The token only proves identity (`sub`). Staff status and role come from `staff_users` on every request, so deactivating someone or changing their role takes effect on their next request, even though their Supabase token stays valid until it expires.
- A signed-in Supabase user who is not provisioned as staff gets `403`. **Disable public sign-ups in Supabase** (Authentication → Providers/Settings) anyway, as defence in depth.
- If the JWKS can't be fetched, the API answers `503`, not `401`, and logs an error.
- If staff auth is not configured (`SUPABASE_URL` unset), every admin route answers `503` and a warning is logged at startup. Public routes are unaffected.
- Admin responses carry `Cache-Control: no-store`. A `401` carries `WWW-Authenticate: Bearer`. Tokens are never logged. Every log line of an authenticated request includes `staffId` and `staffRole`.

## Configuration

| Variable              | Required             | Purpose                                                                                                                                                                                   |
| --------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`        | for the admin API    | Project URL, e.g. `https://<ref>.supabase.co` (https in production). Issuer = `<url>/auth/v1`; JWKS = `<url>/auth/v1/.well-known/jwks.json`                                               |
| `SUPABASE_JWT_SECRET` | legacy only          | Only for projects still on the legacy HS256 shared secret (Project Settings → API/JWT). When set, it is used **instead of** the JWKS. Prefer asymmetric signing keys and leave this unset |
| `STAFF_AUTH_AUDIENCE` | no (`authenticated`) | Expected `aud` claim                                                                                                                                                                      |

Allowed algorithms are pinned: `ES256`/`RS256` with the JWKS, and `HS256` only with the legacy secret. `alg: none` is always refused. The backend never uses the Supabase `anon` or `service_role` keys.

The admin dashboard (a separate frontend) signs staff in with Supabase Auth in the browser and sends the session's `access_token` as the bearer token. Add the dashboard's origin to `CORS_ALLOWED_ORIGINS`. CORS preflight requests are not authenticated.

## Provisioning staff

Staff are created explicitly. Signing up with Supabase grants nothing.

1. Create or invite the user in Supabase (Authentication → Users) and copy their **User UID**.
2. Map them to a staff role:

```bash
npm run staff -- add <user-uid> jane@phistream.example "Jane Doe" ADMIN
npm run staff -- role jane@phistream.example REVIEWER
npm run staff -- deactivate jane@phistream.example     # offboarding: effective immediately
npm run staff -- activate jane@phistream.example
npm run staff -- list
```

In the production image use `npm run staff:prod -- …` (runs from `dist/`). Every change is written to `audit_logs` (`staff.added`, `staff.role_changed`, `staff.deactivated`, `staff.activated`, actor `null`, `metadata.via = "cli"`). An admin API for staff management can replace the CLI later.

## Roles

Defined in `src/modules/admin/permissions.ts`:

| Permission             | Endpoints                                                                                                                     | ADMIN | REVIEWER |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- | :---: | :------: |
| `leads:read`           | `GET /admin/leads`                                                                                                            |   ✓   |    ✓     |
| `applications:read`    | `GET /admin/applications`, `GET /admin/applications/:id`                                                                      |   ✓   |    ✓     |
| `applications:decide`  | `POST …/review`, `…/accept`, `…/reject`                                                                                       |   ✓   |    ✓     |
| `applications:note`    | `POST …/notes`                                                                                                                |   ✓   |    ✓     |
| `scheduling:manage`    | `POST …/scheduling-access`, `GET …/booking` ([scheduling.md](scheduling.md))                                                  |   ✓   |    ✓     |
| `notifications:read`   | `GET /admin/notifications` ([notifications.md](notifications.md))                                                             |   ✓   |    ✗     |
| `notifications:manage` | `POST /admin/notifications/:id/retry`                                                                                         |   ✓   |    ✗     |
| `analytics:read`       | `GET /admin/analytics/funnel` ([analytics.md](analytics.md))                                                                  |   ✓   |    ✗     |
| `leads:erase`          | `DELETE /admin/leads/:id` (privacy erasure; [PRODUCTION_READINESS.md](../PRODUCTION_READINESS.md#data-retention-and-erasure)) |   ✓   |    ✗     |
| `audit_logs:read`      | `GET /admin/audit-logs`                                                                                                       |   ✓   |    ✗     |

## Review actions and transactions

There is **no endpoint that sets a status directly**. Only the named actions exist, and each is validated by the state machine ([applications.md](applications.md#state-machine)).

Each action runs as **one database transaction holding `SELECT … FOR UPDATE` on the application**, and contains:

| Action | Transitions (lifecycle events)                                                               | Audit action                 | Outbox event           |
| ------ | -------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------- |
| review | NEW → UNDER_REVIEW (`REVIEW_STARTED`, STAFF)                                                 | `application.review_started` | none                   |
| accept | UNDER_REVIEW → ACCEPTED (`ACCEPTED`, STAFF) → SCHEDULING_OPEN (`SCHEDULING_ENABLED`, SYSTEM) | `application.accepted`       | `APPLICATION_ACCEPTED` |
| reject | UNDER_REVIEW → REJECTED (`REJECTED`, STAFF)                                                  | `application.rejected`       | `APPLICATION_REJECTED` |
| notes  | none (note row)                                                                              | `application.note_added`     | none                   |

- Accept and reject record `reviewed_by`/`reviewed_at`; accept also records `accepted_at`, and reject records the optional `rejection_reason`.
- **Acceptance creates scheduling eligibility** as a state transition: the `SYSTEM` step to `SCHEDULING_OPEN` with a `SCHEDULING_ENABLED` event. Phase 6 will issue the actual scheduling access through the provider adapter, driven by that state and event, never from inside this transaction.
- If any part fails (including the audit insert), nothing is recorded. Concurrent decisions on one application run one at a time; the second sees the new status and gets `409 CONFLICT`.
- Audit metadata holds ids and classifications only (e.g. `reasonProvided: true`, `noteId`), never reason text, note bodies, answers or contact details.
- Unexpected errors, including database errors, return the generic `500 INTERNAL_ERROR` envelope. SQL, constraint names and values never reach the client, and logs are scrubbed of query parameters.

## Private data

Admin endpoints are the only place answers, notes, rejection reasons and lead contact details are served. Even here, secrets are never selected: status-token hashes and submission fingerprints are not part of any admin query. The application detail view labels each answer with the question from the **form version the applicant actually answered**.

## Not yet decided or built

- **Staff MFA:** Supabase tokens carry an `aal` claim. Requiring `aal2` for staff is a small addition once MFA is enabled in Supabase.
- **Read auditing:** reads of private data (e.g. opening an application) are not audit-logged, only state changes are. Add it if compliance requires an access trail.
- **Search:** it uses `ILIKE '%…%'` (sequential scan). Add `pg_trgm` indexes if lead volume grows large.
- **Pagination:** offset pagination is capped at offset 10,000. Switch to keyset pagination if lists get that long.
