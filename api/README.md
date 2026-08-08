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

## Start API

```bash
corepack pnpm run api:dev
```

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
