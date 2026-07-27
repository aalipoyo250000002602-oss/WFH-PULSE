-- WFH-PULSE auth/login flow examples (PostgreSQL 18)
-- Uses functions/tables from 01_schema_postgresql18.sql

-- 1) Register an employee user account
-- SELECT app_auth.register_user('new.employee@company.com', 'P@ssw0rd123!', 'emp-3', 'employee');

-- 2) Login with email + password
-- Returns: user_id, role_name, session_id, refresh_token
SELECT *
FROM app_auth.login_user(
  'Alex.Ali@uic.co',
  'P@ssw0rd123!',
  '127.0.0.1'::inet,
  'WFH-PULSE mobile app'
);

-- 3) Refresh session (app-side flow suggestion)
-- a) Lookup active session by session_id
-- b) Compare provided refresh token with stored refresh_token_hash
-- c) Rotate refresh token and update expires_at
-- Example check query:
-- SELECT s.session_id
-- FROM app_auth.sessions s
-- WHERE s.session_id = :session_id
--   AND s.revoked_at IS NULL
--   AND s.expires_at > NOW()
--   AND s.refresh_token_hash = crypt(:refresh_token, s.refresh_token_hash);

-- 4) Logout from one device
-- SELECT app_auth.revoke_session(:session_id);

-- 5) Force logout all devices for a user
-- UPDATE app_auth.sessions
-- SET revoked_at = NOW()
-- WHERE user_id = :user_id
--   AND revoked_at IS NULL;

-- 6) View recent login attempts
SELECT
  la.attempted_at,
  la.email,
  la.success,
  la.reason,
  la.ip_address,
  la.user_agent
FROM app_auth.login_attempts la
ORDER BY la.attempted_at DESC
LIMIT 20;

