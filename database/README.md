# WFH-PULSE Database

This folder contains PostgreSQL 18 schema, seed data, migrations, and RLS policies.

## Files

- `01_schema_postgresql18.sql` - base schema (app + auth)
- `02_seed_postgresql18.sql` - seed data from existing app mock data
- `03_auth_process_examples.sql` - sample SQL auth flow
- `04_rls_policies.sql` - row-level security policies for self-service + HR/Admin
- `migrations/*.up.sql` / `migrations/*.down.sql` - migration units
- `migrate.mjs` - migration runner with `up/down/status`
- `db.config.mjs` - local PG config loader
- `test-connection.mjs` - connection tester

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

Rollback latest migration:

```bash
corepack pnpm run db:migrate:down
```

## Legacy schema/seed runner

```bash
corepack pnpm run db:setup:dry
corepack pnpm run db:setup
```

