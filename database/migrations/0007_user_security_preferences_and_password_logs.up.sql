CREATE TABLE IF NOT EXISTS app_auth.user_security_preferences (
  user_id UUID PRIMARY KEY REFERENCES app_auth.users(user_id) ON DELETE CASCADE,
  biometric_login BOOLEAN NOT NULL DEFAULT FALSE,
  biometric_clock_in_out BOOLEAN NOT NULL DEFAULT FALSE,
  password_waived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_auth.user_security_preferences (
  user_id,
  biometric_login,
  biometric_clock_in_out,
  password_waived
)
SELECT
  u.user_id,
  COALESCE(up.biometric_login, u.biometric_enabled, FALSE),
  COALESCE(up.biometric_clock_in_out, FALSE),
  FALSE
FROM app_auth.users u
LEFT JOIN app.user_preferences up ON up.user_id = u.user_id
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE app_auth.password_activities
  ADD COLUMN IF NOT EXISTS is_waived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS details JSONB,
  ADD COLUMN IF NOT EXISTS ip_address INET,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;
