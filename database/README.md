# WFH-PULSE Database

This folder contains PostgreSQL 18 schema, seed data, migrations, and RLS policies.

Supabase compatibility note: this project uses `app_auth` for custom auth/session tables and functions so it does not conflict with Supabase-managed `auth.*` objects.

## Files

- `01_schema_postgresql18.sql` - base schema (app + auth)
- `02_seed_postgresql18.sql` - seed data from existing app mock data
- `03_auth_process_examples.sql` - sample SQL auth flow
- `04_rls_policies.sql` - row-level security policies for self-service + HR/Admin
- `migrations/*.up.sql` / `migrations/*.down.sql` - migration units
- `migrate.mjs` - migration runner with `up/down/status`
- `db.config.mjs` - local PG config loader
- `test-connection.mjs` - connection tester

## Supabase config

Use `database/.env.local.supabase` for direct connection-string mode:

```dotenv
SUPABASE_DB_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require
PGSSL=true
```

`db.config.mjs` will prefer `SUPABASE_DB_URL` (or `DATABASE_URL` / `POSTGRES_URL`) when present.

## Local config

Use `database/.env.local.postgres`:

```dotenv
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=wfh_pulse
PGUSER=postgres
PGPASSWORD=your_password
PGSSL=false
```

## Migration workflow (no psql required)

```bash
corepack pnpm run db:migrate:dry
corepack pnpm run db:migrate
corepack pnpm run db:migrate:status
```

## Smooth local + Supabase sync

Run build first, then apply migrations to local Postgres and Supabase in order:

```bash
corepack pnpm run db:sync:all
```

Dry-run (prints commands, no changes):

```bash
corepack pnpm run db:sync:all:dry
```

Skip build and only run migrations on both targets:

```bash
corepack pnpm run db:sync:all:no-build
```

Current migration set includes:

- `0001_init` - base schema + RLS setup include
- `0002_seed` - initial seed data
- `0003_auth_refresh_and_self_update_guard` - refresh session function + protected self-update trigger

Rollback latest migration:

```bash
corepack pnpm run db:migrate:down
```

## Legacy schema/seed runner

```bash
corepack pnpm run db:setup:dry
corepack pnpm run db:setup
```

