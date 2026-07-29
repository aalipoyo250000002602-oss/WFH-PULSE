-- WFH-PULSE PostgreSQL 18 schema
-- Covers entities used across pages/components and includes auth/login tables.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS app_auth;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_status') THEN
    CREATE TYPE app.attendance_status AS ENUM ('present', 'late', 'absent', 'on-leave', 'holiday');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employment_status') THEN
    CREATE TYPE app.employment_status AS ENUM ('onboarding', 'active', 'inactive');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employment_type') THEN
    CREATE TYPE app.employment_type AS ENUM ('full-time', 'independent contractor');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'request_status') THEN
    CREATE TYPE app.request_status AS ENUM ('pending', 'approved', 'denied', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'adjustment_reason') THEN
    CREATE TYPE app.adjustment_reason AS ENUM ('Forgot to Clock-in/Clock-out', 'Missing logs');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'holiday_type') THEN
    CREATE TYPE app.holiday_type AS ENUM ('public', 'personal');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS app.departments (
  department_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS app.employees (
  employee_id TEXT PRIMARY KEY,
  employee_code TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email CITEXT,
  phone TEXT,
  department_id BIGINT REFERENCES app.departments(department_id),
  position TEXT,
  attendance_status app.attendance_status NOT NULL DEFAULT 'present',
  employment_status app.employment_status NOT NULL DEFAULT 'active',
  employment_type app.employment_type NOT NULL DEFAULT 'full-time',
  clock_in_time TEXT,
  clock_out_time TEXT,
  work_duration_minutes INTEGER,
  late_minutes INTEGER,
  join_date DATE,
  birthday DATE,
  gender TEXT,
  nationality TEXT,
  marital_status TEXT,
  address TEXT,
  invitation_sent_date DATE,
  password_changed BOOLEAN,
  profile_picture_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.payroll_profiles (
  employee_id TEXT PRIMARY KEY REFERENCES app.employees(employee_id) ON DELETE CASCADE,
  salary NUMERIC(12,2) NOT NULL,
  pag_ibig TEXT,
  phil_health TEXT,
  sss TEXT,
  tin TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.payroll_deductions (
  deduction_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES app.employees(employee_id) ON DELETE CASCADE,
  deduction_name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS app.attendance_records (
  attendance_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES app.employees(employee_id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status app.attendance_status NOT NULL,
  clock_in TIME,
  clock_out TIME,
  work_duration_minutes INTEGER,
  total_break_duration_minutes INTEGER NOT NULL DEFAULT 0,
  active_break_started_at TIMESTAMPTZ,
  late_minutes INTEGER DEFAULT 0,
  UNIQUE (employee_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS app.attendance_break_logs (
  break_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attendance_id BIGINT NOT NULL REFERENCES app.attendance_records(attendance_id) ON DELETE CASCADE,
  break_started_at TIMESTAMPTZ NOT NULL,
  break_ended_at TIMESTAMPTZ,
  break_duration_minutes INTEGER,
  CHECK (break_ended_at IS NULL OR break_ended_at >= break_started_at),
  CHECK (break_duration_minutes IS NULL OR break_duration_minutes >= 0)
);

CREATE INDEX IF NOT EXISTS idx_attendance_break_logs_attendance_started
  ON app.attendance_break_logs (attendance_id, break_started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_break_logs_single_open_break
  ON app.attendance_break_logs (attendance_id)
  WHERE break_ended_at IS NULL;

CREATE TABLE IF NOT EXISTS app.attendance_activity_logs (
  activity_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attendance_id BIGINT NOT NULL REFERENCES app.attendance_records(attendance_id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES app.employees(employee_id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('clock_in', 'clock_out', 'break_start', 'break_end')),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_attendance_activity_logs_attendance
  ON app.attendance_activity_logs (attendance_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_activity_logs_employee
  ON app.attendance_activity_logs (employee_id, logged_at DESC);

CREATE TABLE IF NOT EXISTS app.attendance_leave_details (
  attendance_id BIGINT PRIMARY KEY REFERENCES app.attendance_records(attendance_id) ON DELETE CASCADE,
  request_date DATE NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  reason TEXT NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS app.attendance_leave_attachments (
  attachment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attendance_id BIGINT NOT NULL REFERENCES app.attendance_records(attendance_id) ON DELETE CASCADE,
  file_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app.attendance_adjustment_requests (
  request_id TEXT PRIMARY KEY,
  employee_id TEXT REFERENCES app.employees(employee_id),
  employee_name TEXT,
  position TEXT,
  department TEXT,
  request_date DATE,
  shift_date_from DATE NOT NULL,
  shift_date_to DATE NOT NULL,
  clock_in_time TEXT,
  clock_out_time TEXT,
  reason app.adjustment_reason NOT NULL,
  break_duration_minutes INTEGER,
  total_work_duration_minutes INTEGER,
  message TEXT,
  status app.request_status NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  denied_reason TEXT,
  source_page TEXT NOT NULL DEFAULT 'dashboard'
);

CREATE TABLE IF NOT EXISTS app.adjustment_request_attachments (
  attachment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES app.attendance_adjustment_requests(request_id) ON DELETE CASCADE,
  file_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app.adjustment_request_logs (
  log_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES app.attendance_adjustment_requests(request_id) ON DELETE CASCADE,
  status app.request_status NOT NULL,
  logged_at TIMESTAMPTZ NOT NULL,
  approved_by TEXT,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS app.leave_types (
  leave_type_id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  default_limit_days INTEGER NOT NULL DEFAULT 10
);

CREATE TABLE IF NOT EXISTS app.leave_balances (
  employee_id TEXT NOT NULL REFERENCES app.employees(employee_id) ON DELETE CASCADE,
  leave_type_id TEXT NOT NULL REFERENCES app.leave_types(leave_type_id) ON DELETE CASCADE,
  credits INTEGER NOT NULL,
  accrued INTEGER,
  limit_days INTEGER,
  PRIMARY KEY (employee_id, leave_type_id)
);

CREATE TABLE IF NOT EXISTS app.leave_requests (
  request_id TEXT PRIMARY KEY,
  employee_id TEXT REFERENCES app.employees(employee_id),
  leave_type_id TEXT NOT NULL REFERENCES app.leave_types(leave_type_id),
  leave_type_name TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  message TEXT,
  status app.request_status NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  source_page TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app.leave_request_attachments (
  attachment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES app.leave_requests(request_id) ON DELETE CASCADE,
  file_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app.leave_request_logs (
  log_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES app.leave_requests(request_id) ON DELETE CASCADE,
  status app.request_status NOT NULL,
  logged_at TIMESTAMPTZ NOT NULL,
  approved_by TEXT,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS app.holidays (
  holiday_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  holiday_date DATE NOT NULL UNIQUE,
  holiday_type app.holiday_type NOT NULL,
  days_until INTEGER
);

CREATE TABLE IF NOT EXISTS app_auth.roles (
  role_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role_name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS app_auth.users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT UNIQUE REFERENCES app.employees(employee_id) ON DELETE SET NULL,
  email CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  biometric_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  dark_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS app_auth.user_roles (
  user_id UUID NOT NULL REFERENCES app_auth.users(user_id) ON DELETE CASCADE,
  role_id BIGINT NOT NULL REFERENCES app_auth.roles(role_id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS app_auth.sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_auth.users(user_id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS app_auth.login_attempts (
  attempt_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email CITEXT NOT NULL,
  user_id UUID REFERENCES app_auth.users(user_id) ON DELETE SET NULL,
  success BOOLEAN NOT NULL,
  reason TEXT,
  ip_address INET,
  user_agent TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_auth.password_activities (
  activity_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_auth.users(user_id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  platform TEXT,
  status TEXT,
  is_waived BOOLEAN NOT NULL DEFAULT FALSE,
  details JSONB,
  ip_address INET,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS app_auth.user_security_preferences (
  user_id UUID PRIMARY KEY REFERENCES app_auth.users(user_id) ON DELETE CASCADE,
  biometric_login BOOLEAN NOT NULL DEFAULT FALSE,
  biometric_clock_in_out BOOLEAN NOT NULL DEFAULT FALSE,
  password_waived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES app_auth.users(user_id) ON DELETE CASCADE,
  working_start TIME NOT NULL DEFAULT TIME '09:00',
  working_end TIME NOT NULL DEFAULT TIME '18:00',
  clock_in_reminder BOOLEAN NOT NULL DEFAULT TRUE,
  clock_out_reminder BOOLEAN NOT NULL DEFAULT TRUE,
  daily_report BOOLEAN NOT NULL DEFAULT FALSE,
  biometric_login BOOLEAN NOT NULL DEFAULT TRUE,
  biometric_clock_in_out BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS app.user_working_days (
  user_id UUID NOT NULL REFERENCES app_auth.users(user_id) ON DELETE CASCADE,
  iso_day SMALLINT NOT NULL CHECK (iso_day BETWEEN 1 AND 7),
  is_working_day BOOLEAN NOT NULL,
  PRIMARY KEY (user_id, iso_day)
);

CREATE TABLE IF NOT EXISTS app.company_settings_working_hours (
  working_hour_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  iso_day SMALLINT NOT NULL UNIQUE CHECK (iso_day BETWEEN 1 AND 7),
  day_name TEXT NOT NULL UNIQUE,
  is_working_day BOOLEAN NOT NULL DEFAULT TRUE,
  start_time TIME,
  end_time TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_settings_working_hours_day_name_chk CHECK (
    lower(day_name) = ANY (ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
  ),
  CONSTRAINT company_settings_working_hours_schedule_chk CHECK (
    (is_working_day = TRUE AND start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
    OR
    (is_working_day = FALSE AND start_time IS NULL AND end_time IS NULL)
  )
);

CREATE OR REPLACE FUNCTION app_auth.register_user(
  p_email CITEXT,
  p_password TEXT,
  p_employee_id TEXT,
  p_role TEXT DEFAULT 'employee'
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
  v_role_id BIGINT;
BEGIN
  INSERT INTO app_auth.users (email, password_hash, employee_id)
  VALUES (p_email, crypt(p_password, gen_salt('bf', 10)), p_employee_id)
  RETURNING user_id INTO v_user_id;

  SELECT role_id INTO v_role_id FROM app_auth.roles WHERE role_name = p_role;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Role % does not exist', p_role;
  END IF;

  INSERT INTO app_auth.user_roles (user_id, role_id) VALUES (v_user_id, v_role_id);
  RETURN v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION app_auth.login_user(
  p_email CITEXT,
  p_password TEXT,
  p_ip INET,
  p_user_agent TEXT
) RETURNS TABLE(
  user_id UUID,
  role_name TEXT,
  session_id UUID,
  refresh_token TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_user app_auth.users%ROWTYPE;
  v_role TEXT;
  v_refresh_token TEXT;
  v_session_id UUID;
BEGIN
  SELECT * INTO v_user FROM app_auth.users WHERE email = p_email;

  IF v_user.user_id IS NULL OR v_user.is_active = FALSE THEN
    INSERT INTO app_auth.login_attempts (email, success, reason, ip_address, user_agent)
    VALUES (p_email, FALSE, 'user_not_found_or_inactive', p_ip, p_user_agent);
    RAISE EXCEPTION 'Invalid credentials';
  END IF;

  IF v_user.password_hash <> crypt(p_password, v_user.password_hash) THEN
    INSERT INTO app_auth.login_attempts (email, user_id, success, reason, ip_address, user_agent)
    VALUES (p_email, v_user.user_id, FALSE, 'invalid_password', p_ip, p_user_agent);
    RAISE EXCEPTION 'Invalid credentials';
  END IF;

  SELECT r.role_name
    INTO v_role
  FROM app_auth.user_roles ur
  JOIN app_auth.roles r ON r.role_id = ur.role_id
  WHERE ur.user_id = v_user.user_id
  ORDER BY r.role_name
  LIMIT 1;

  v_refresh_token := encode(gen_random_bytes(48), 'hex');

  INSERT INTO app_auth.sessions (
    user_id,
    refresh_token_hash,
    ip_address,
    user_agent,
    expires_at
  ) VALUES (
    v_user.user_id,
    crypt(v_refresh_token, gen_salt('bf', 8)),
    p_ip,
    p_user_agent,
    NOW() + INTERVAL '30 days'
  )
  RETURNING app_auth.sessions.session_id INTO v_session_id;

  UPDATE app_auth.users SET last_login_at = NOW() WHERE app_auth.users.user_id = v_user.user_id;

  INSERT INTO app_auth.login_attempts (email, user_id, success, ip_address, user_agent)
  VALUES (p_email, v_user.user_id, TRUE, p_ip, p_user_agent);

  RETURN QUERY SELECT v_user.user_id, COALESCE(v_role, 'employee'), v_session_id, v_refresh_token;
END;
$$;

CREATE OR REPLACE FUNCTION app_auth.revoke_session(p_session_id UUID)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE app_auth.sessions
  SET revoked_at = NOW()
  WHERE session_id = p_session_id
    AND revoked_at IS NULL;
$$;

