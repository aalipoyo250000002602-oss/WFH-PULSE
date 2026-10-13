# WFH-PULSE API Layer

This API wires the PostgreSQL schema to a Node.js backend with auth endpoints and RLS-aware queries.

## Features

- `POST /auth/login`
- `POST /auth/supabase/exchange`
- `POST /auth/refresh`
- `POST /auth/register` (admin/hr only)
- `POST /auth/logout`
- `GET /me/profile` (self-service)
- `PATCH /me/profile` (self-service, limited editable fields)
- `GET /me/attendance` (self-service)
- `GET /me/slack-notification-logs` (self-service)
- `GET /employees` (authenticated, RLS-scoped)
- `GET /hr/employees` (HR/Admin)
- `GET /health`

## MVC Structure

The API is now organized with an MVC-oriented layout under `api/src`:

- `controllers/` route handlers and API composition
- `models/` database access and RLS context helpers
- `services/` auth/token domain services
- `middleware/` request auth/role guards
- `config/` runtime config/env resolution

Current domain controller split:

- `controllers/auth.controller.mjs` as auth-domain composition root
- `controllers/auth-session.controller.mjs` for login/session/token/logout endpoints
- `controllers/auth-admin.controller.mjs` for admin/hr registration endpoint
- `controllers/me.controller.mjs` as me-domain composition root
- `controllers/me-profile.controller.mjs` for `/me/profile`, `/me/security-preferences*`, and `/meta/employment-options`
- `controllers/me-attendance.controller.mjs` for attendance, adjustment, overtime, and calendar routes
- `controllers/employees.controller.mjs` as employees-domain composition root
- `controllers/employees-core.controller.mjs` for `/employees` CRUD and `/hr/employees`
- `controllers/employees-payroll.controller.mjs` for `/employees/:employeeId/payroll`
- `controllers/settings.controller.mjs` for `/settings/company-working-hours*`
- `controllers/api.controller.mjs` remains the API composition root (health endpoint, wiring, boot lifecycle)

Backward-compatible root modules (`api/server.mjs`, `api/auth.mjs`, `api/db.mjs`, `api/middleware.mjs`, `api/config.mjs`) are kept as entry/shim files.

## Required config

1. `database/.env.local.postgres`
2. `api/.env.local` (copy from `api/.env.example`)

Optional Slack attendance notifications (clock-in/clock-out):

- `SLACK_WEBHOOK_URL`: Incoming webhook URL for your Slack workspace.
- `SLACK_CHANNEL`: Channel override (for example `#attendance`) if your webhook allows it.
- `SLACK_USERNAME`: Bot display name. Default: `WFH-PULSE Attendance Bot`.
- `SLACK_ICON_EMOJI`: Bot icon emoji. Default: `:alarm_clock:`.

When `SLACK_WEBHOOK_URL` is unset, Slack notifications are automatically disabled.

Optional Smart Leave Planner AI event context:

- `GEMINI_API_KEY`: Server-side Gemini API key used by `POST /me/leave-planner/insights` to enrich recommended schedules with possible local/community events and festivals outside registered company holidays.

When `GEMINI_API_KEY` is unset or credits are unavailable, the planner automatically falls back to built-in schedule guidance.

## Start API

```bash
corepack pnpm run api:dev
```

## Production Supabase Data API

Production web and Android configuration uses:

```text
https://tuypfaqcqsxzuswiglyw.supabase.co/rest/v1/
```

Login remains on Supabase Auth's `/auth/v1/token` endpoint. Data API requests
include the publishable key as `apikey` and the signed-in user's access token
as `Authorization: Bearer ...`. Never use a secret key in the frontend.

The shared frontend request adapter translates Express-style paths to
`/rest/v1/rpc/wfh_pulse_request`, with `Content-Profile: api` and
`Accept-Profile: api`. Install `database/07_supabase_rest_api.sql` in the
Supabase SQL Editor before using this configuration. The function signature is
`api.wfh_pulse_request(p_path text, p_method text, p_query jsonb, p_body jsonb)`.
The script reloads the PostgREST schema cache after installation.

The installed RPC supports attendance clock-in/out and breaks, profile edits,
security preferences, working-hour settings, leave limits, employee creation
and edits, payroll updates/reports, holiday CRUD/imports, leave-credit updates,
leave/adjustment/overtime submissions and HR status transitions, calendar,
attendance history, analytics, employment options, and notification-log reads.
Unknown paths or HTTP methods return 404 rather than the earlier migration
placeholder. No Edge Function deployment is used.

Attendance actions are serialized per employee/date and record audit logs.
Approved adjustments and overtime are included in effective attendance reads.
Payroll retains the local API's 21-working-day, eight-hour daily rate formula.
Request status transitions lock the request; leave approvals and cancellations
update balances in the same transaction. Settings/payroll writes enforce stored
HR/admin roles, independently of frontend permissions.

Password changes go to Supabase Auth's `/auth/v1/user` endpoint with the user's
token; only audit metadata is sent to the RPC. The SQL handler never receives
or stores the new password. Production AI and Slack handlers are defined in
`database/08_external_integrations.sql` and read secrets only from Supabase
Vault: `gemini_api_key` and `slack_attendance_webhook`.
Use the project's **Integrations > Vault > Secrets** page, not **Edge Functions
> Secrets**. Edge Function environment variables are a separate secret store
and are not available to `vault.decrypted_secrets` in PostgreSQL. Add the same
two names and values directly in Vault; do not put values in SQL source or chat.
Check configuration without revealing secret contents:

```sql
SELECT name FROM vault.secrets
WHERE name IN ('gemini_api_key', 'slack_attendance_webhook');
```

Until those entries are configured, AI returns 503 so the built-in planner
fallback remains available, and the Slack trigger safely skips delivery. Slack
events are queued post-commit with `pg_net`; asynchronous delivery results are
not yet written back into the delivery-log table.

The database stores application data in `app`, not `public`. The exposed
`api` wrapper is security-invoker; the private `wfh_private` handler derives
identity from `auth.uid()` and reads roles from `app_auth.user_roles`. It
permits only active linked accounts, filters self-service queries by the
resolved employee, and checks stored HR/admin roles for privileged reads.
Linking by email requires a confirmed Supabase email and an application account
that has not already been linked to a different Supabase identity.
Anonymous RPC execution is revoked. The script does not grant direct table
access, expose `app_auth.users`, or disable existing RLS policies.

### Native Biometric Sign-In

Android/iOS biometric sign-in uses the native biometric or device-credential
prompt and a refresh token encrypted by Android Keystore/iOS Keychain. It
refreshes the session through Supabase Auth directly; no custom biometric API
route, stored password, or browser token storage is required.

After updating the native app, sign in with email/password once and enable
Biometric Login in Security settings. Subsequent local app logout/re-entry can
unlock that saved session. Disabling Biometric Login deletes the saved token;
an invalid/revoked refresh token also clears it and requires password sign-in.
Local app logout retains enrollment intentionally; it is not a Supabase session
revocation. Browser biometric sign-in is not implemented by the native plugin.

Rebuild/reinstall the native app after plugin changes. On an Android emulator,
enroll a fingerprint in Android Settings and supply a fingerprint touch when
the system prompt appears. Run the mocked session-flow checks with
`node --test src/app/biometric-session.test.mjs`; they do not verify device
hardware or use real account credentials.

Local Express development remains unchanged. Run the local rollback-only RPC
regression check with:

```powershell
node database/verify-rest-api.mjs
node --test src/app/api-fetch.test.mjs
```

The database check creates temporary Auth fixtures and runs attendance,
settings, requests, employee CRUD, payroll parity, and employee authorization
assertions inside a rolled-back local PostgreSQL transaction. It rejects remote
hosts. Real password updates are tested with mocked Auth responses, not live
account credentials. After deployment, verify representative RPC operations
under authenticated database roles before releasing client builds.

## Smoke test

Start API first, then:

```bash
corepack pnpm run api:smoke
```

Adjustment request action smoke test (approve, deny, cancel):

```bash
corepack pnpm run api:smoke:adjustments
```

Strict mode:

```bash
corepack pnpm run api:smoke:adjustments:strict
```

Notes:

- Defaults to `test@mit.co` / `testpass` unless overridden with `API_SMOKE_EMAIL` and `API_SMOKE_PASSWORD`.
- Uses available DB sample request states; when a state is unavailable it skips that action unless `--strict` is passed.
- GitHub Actions workflow `.github/workflows/api-newman-ci.yml` runs standard mode on push/PR and supports strict mode via `workflow_dispatch` input `run_strict_adjustment_smoke=true`.

## Postman collection

Import these files:

- `api/postman/WFH-PULSE-API.postman_collection.json`
- `api/postman/WFH-PULSE-Local.postman_environment.json`

Environment defaults:

- Admin default: `test@mit.co` / `testpass`
- Alternate user vars: `altEmail`, `altPassword`
- To switch users quickly, replace `email` + `password` values in the active environment.

Recommended run order in Postman:

1. `Health`
2. `Auth > Login` (stores `accessToken`, `refreshToken`, `sessionId`)
3. `Me (Self-Service) > Get Profile`
4. `Me (Self-Service) > Patch Profile (Allowed Fields)`
5. `Me (Self-Service) > Get Attendance`
6. `Auth > Refresh` (rotates refresh token)
7. `HR/Admin > List Employees` (admin/hr only)
8. `Auth > Logout`

## Newman CLI (Terminal/CI)

Run the same Postman collection via CLI:

```bash
corepack pnpm run api:newman
```

CI-friendly run with JUnit report output:

```bash
corepack pnpm run api:newman:ci
```

This writes `api/postman/newman-report.xml`.

## GitHub Actions

CI workflow file: `.github/workflows/api-newman-ci.yml`

It will:

1. Start PostgreSQL service (`postgres:18`)
2. Apply DB migrations (`corepack pnpm run db:migrate`)
3. Start API server
4. Run Newman collection in CI mode

## Auth notes

- Login uses `app_auth.login_user(...)` DB function.
- Supabase Auth migration path uses `POST /auth/supabase/exchange` to validate a Supabase access token and map/link `auth.users` identities into `app_auth.users`.
- Refresh uses `app_auth.refresh_session(...)` and rotates refresh tokens.
- API issues a short-lived JWT access token.
- Logout revokes DB session via `app_auth.revoke_session(...)`.
- RLS context is set per transaction using:
    - `SET LOCAL app.user_id`
    - `SET LOCAL app.user_role`
- Self-service profile update accepts only contact/personal fields; protected fields are blocked by DB trigger.
