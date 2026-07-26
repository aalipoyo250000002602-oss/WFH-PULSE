# WFH-PULSE API Layer

This API wires the PostgreSQL schema to a Node.js backend with auth endpoints and RLS-aware queries.

## Features

- `POST /auth/login`
- `POST /auth/register` (admin/hr only)
- `POST /auth/logout`
- `GET /me/profile` (self-service)
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

## Auth notes

- Login uses `auth.login_user(...)` DB function.
- API issues a short-lived JWT access token.
- Logout revokes DB session via `auth.revoke_session(...)`.
- RLS context is set per transaction using:
  - `SET LOCAL app.user_id`
  - `SET LOCAL app.user_role`

