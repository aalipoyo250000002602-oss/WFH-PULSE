# WFH-PULSE Database (PostgreSQL 18)

This folder contains a full relational database design for the current app pages/components:

- `01_schema_postgresql18.sql`: tables, enums, constraints, auth/session functions
- `02_seed_postgresql18.sql`: seed data from existing mocked app data (employees, attendance, leave, adjustments, holidays, user settings)
- `03_auth_process_examples.sql`: sample login/auth SQL flow

## Covered app areas

- Login and auth (`login-form.tsx`, `App.tsx`)
- Home dashboard attendance + attendance adjustment
- Employee directory + employee details + payroll
- Calendar holidays + leave requests
- Analytics dependencies (attendance/leave/payroll sources)
- Settings (working hours, work days, notifications, security/password activity)

## Quick setup

```sql
CREATE DATABASE wfh_pulse;
\c wfh_pulse;
\i database/01_schema_postgresql18.sql
\i database/02_seed_postgresql18.sql
```

## Test login function

```sql
SELECT *
FROM auth.login_user(
  'Alex.Ali@uic.co',
  'P@ssw0rd123!',
  '127.0.0.1'::inet,
  'WFH-PULSE mobile app'
);
```

## Notes

- Seed passwords use bcrypt (`pgcrypto` + `crypt`).
- `auth.sessions` stores only hashed refresh tokens.
- Access token issuance is expected to be handled by your API layer; DB handles credential verification and refresh-session state.

