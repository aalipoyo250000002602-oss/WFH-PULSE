-- Seed local application users into Supabase-linked accounts.
-- Safe to re-run: updates links, inserts only missing rows, and avoids duplicate roles/preferences.

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- Ensure baseline roles exist for role assignment.
INSERT INTO app_auth.roles (role_name)
VALUES ('admin'), ('hr_manager'), ('employee')
ON CONFLICT (role_name) DO NOTHING;

-- Clear stale links when the referenced Supabase Auth user no longer matches.
UPDATE app_auth.users u
SET supabase_auth_user_id = NULL,
    updated_at = NOW()
WHERE u.supabase_auth_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM auth.users a
    WHERE a.id = u.supabase_auth_user_id
      AND a.email IS NOT NULL
      AND lower(a.email) = lower(u.email::text)
      AND a.email_confirmed_at IS NOT NULL
  );

-- Link existing local users to confirmed Supabase Auth users by email.
UPDATE app_auth.users u
SET supabase_auth_user_id = a.id,
    is_active = TRUE,
    updated_at = NOW()
FROM auth.users a
WHERE a.email IS NOT NULL
  AND a.email_confirmed_at IS NOT NULL
  AND lower(a.email) = lower(u.email::text)
  AND u.supabase_auth_user_id IS DISTINCT FROM a.id;

-- Backfill app_auth.users for confirmed Supabase Auth users not present locally.
INSERT INTO app_auth.users (
  supabase_auth_user_id,
  employee_id,
  email,
  password_hash,
  is_active,
  biometric_enabled,
  dark_mode_enabled,
  location
)
SELECT
  a.id,
  e.employee_id,
  a.email::citext,
  crypt(gen_random_uuid()::text, gen_salt('bf', 10)),
  TRUE,
  FALSE,
  FALSE,
  NULL
FROM auth.users a
LEFT JOIN app.employees e
  ON lower(e.email::text) = lower(a.email)
LEFT JOIN app_auth.users u
  ON lower(u.email::text) = lower(a.email)
WHERE a.email IS NOT NULL
  AND a.email_confirmed_at IS NOT NULL
  AND u.user_id IS NULL
ON CONFLICT (email) DO NOTHING;

-- Give every app user at least one role (default: employee).
INSERT INTO app_auth.user_roles (user_id, role_id)
SELECT u.user_id, r.role_id
FROM app_auth.users u
JOIN app_auth.roles r
  ON r.role_name = 'employee'
LEFT JOIN app_auth.user_roles ur
  ON ur.user_id = u.user_id
WHERE ur.user_id IS NULL
ON CONFLICT DO NOTHING;

-- Seed missing user preference rows.
INSERT INTO app.user_preferences (
  user_id,
  working_start,
  working_end,
  clock_in_reminder,
  clock_out_reminder,
  daily_report,
  biometric_login,
  biometric_clock_in_out
)
SELECT
  u.user_id,
  TIME '09:00',
  TIME '18:00',
  TRUE,
  TRUE,
  FALSE,
  TRUE,
  FALSE
FROM app_auth.users u
LEFT JOIN app.user_preferences p
  ON p.user_id = u.user_id
WHERE p.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- Seed default working days for users missing some/all day rows.
INSERT INTO app.user_working_days (user_id, iso_day, is_working_day)
SELECT
  u.user_id,
  d.iso_day,
  d.is_working_day
FROM app_auth.users u
CROSS JOIN (
  VALUES
    (1, TRUE),
    (2, TRUE),
    (3, TRUE),
    (4, TRUE),
    (5, TRUE),
    (6, FALSE),
    (7, FALSE)
) AS d(iso_day, is_working_day)
ON CONFLICT (user_id, iso_day) DO NOTHING;

-- Seed missing security preferences.
INSERT INTO app_auth.user_security_preferences (
  user_id,
  biometric_login,
  biometric_clock_in_out,
  password_waived
)
SELECT
  u.user_id,
  FALSE,
  FALSE,
  FALSE
FROM app_auth.users u
LEFT JOIN app_auth.user_security_preferences sp
  ON sp.user_id = u.user_id
WHERE sp.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- Quick sync summary.
SELECT jsonb_build_object(
  'appUsers', (SELECT count(*) FROM app_auth.users),
  'linkedToSupabaseAuth', (SELECT count(*) FROM app_auth.users WHERE supabase_auth_user_id IS NOT NULL),
  'unlinkedAppUsers', (SELECT count(*) FROM app_auth.users WHERE supabase_auth_user_id IS NULL),
  'supabaseAuthUsers', (SELECT count(*) FROM auth.users),
  'usersWithRoles', (
    SELECT count(DISTINCT user_id)
    FROM app_auth.user_roles
  )
) AS user_sync_summary;

COMMIT;
