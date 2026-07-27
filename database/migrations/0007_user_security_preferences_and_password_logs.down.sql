ALTER TABLE app_auth.password_activities
  DROP COLUMN IF EXISTS user_agent,
  DROP COLUMN IF EXISTS ip_address,
  DROP COLUMN IF EXISTS details,
  DROP COLUMN IF EXISTS is_waived;

DROP TABLE IF EXISTS app_auth.user_security_preferences;
