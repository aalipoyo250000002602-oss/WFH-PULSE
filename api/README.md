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

The installed RPC supports the main read endpoints: profile, attendance today,
attendance history, calendar, employment options, employees, leave requests,
adjustment/overtime requests, security preferences, working hours, leave types,
and admin holiday reads. Unmigrated operations explicitly return HTTP 501;
write operations, analytics, advanced attendance aggregation, and payroll
reports are not yet supported. No Edge Function deployment is used.

The database stores application data in `app`, not `public`. The exposed
`api` wrapper is security-invoker; the private `wfh_private` handler derives
identity from `auth.uid()` and reads roles from `app_auth.user_roles`. It
permits only active linked accounts, filters self-service queries by the
resolved employee, and checks stored HR/admin roles for privileged reads.
Linking by email requires a confirmed Supabase email and an application account
that has not already been linked to a different Supabase identity.
Anonymous RPC execution is revoked. The script does not grant direct table
access, expose `app_auth.users`, or disable existing RLS policies.

Local Express development remains unchanged. A full production release still
requires migrating and verifying the remaining operations with employee and
HR/admin accounts, including write validation and approval workflows.

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
