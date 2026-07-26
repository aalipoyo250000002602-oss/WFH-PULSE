# WFH-PULSE API Layer

This API wires the PostgreSQL schema to a Node.js backend with auth endpoints and RLS-aware queries.

## Features

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/register` (admin/hr only)
- `POST /auth/logout`
- `GET /me/profile` (self-service)
- `PATCH /me/profile` (self-service, limited editable fields)
- `GET /me/attendance` (self-service)
- `GET /hr/employees` (HR/Admin)
- `GET /health`

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

## Postman collection

Import these files:

- `api/postman/WFH-PULSE-API.postman_collection.json`
- `api/postman/WFH-PULSE-Local.postman_environment.json`

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

## Auth notes

- Login uses `auth.login_user(...)` DB function.
- Refresh uses `auth.refresh_session(...)` and rotates refresh tokens.
- API issues a short-lived JWT access token.
- Logout revokes DB session via `auth.revoke_session(...)`.
- RLS context is set per transaction using:
  - `SET LOCAL app.user_id`
  - `SET LOCAL app.user_role`
- Self-service profile update accepts only contact/personal fields; protected fields are blocked by DB trigger.

