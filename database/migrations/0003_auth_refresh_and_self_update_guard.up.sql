CREATE OR REPLACE FUNCTION app_auth.refresh_session(
  p_session_id UUID,
  p_refresh_token TEXT,
  p_ip INET,
  p_user_agent TEXT
) RETURNS TABLE(
  user_id UUID,
  role_name TEXT,
  session_id UUID,
  refresh_token TEXT,
  employee_id TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_session app_auth.sessions%ROWTYPE;
  v_role TEXT;
  v_refresh_token TEXT;
  v_employee_id TEXT;
BEGIN
  SELECT * INTO v_session
  FROM app_auth.sessions
  WHERE app_auth.sessions.session_id = p_session_id;

  IF v_session.session_id IS NULL OR v_session.revoked_at IS NOT NULL OR v_session.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Session expired or invalid';
  END IF;

  IF v_session.refresh_token_hash <> crypt(p_refresh_token, v_session.refresh_token_hash) THEN
    RAISE EXCEPTION 'Invalid refresh token';
  END IF;

  SELECT r.role_name
    INTO v_role
  FROM app_auth.user_roles ur
  JOIN app_auth.roles r ON r.role_id = ur.role_id
  WHERE ur.user_id = v_session.user_id
  ORDER BY r.role_name
  LIMIT 1;

  SELECT u.employee_id INTO v_employee_id
  FROM app_auth.users u
  WHERE u.user_id = v_session.user_id;

  v_refresh_token := encode(gen_random_bytes(48), 'hex');

  UPDATE app_auth.sessions
  SET
    refresh_token_hash = crypt(v_refresh_token, gen_salt('bf', 8)),
    ip_address = COALESCE(p_ip, ip_address),
    user_agent = COALESCE(p_user_agent, user_agent),
    expires_at = NOW() + INTERVAL '30 days'
  WHERE app_auth.sessions.session_id = p_session_id;

  RETURN QUERY
  SELECT v_session.user_id, COALESCE(v_role, 'employee'), v_session.session_id, v_refresh_token, v_employee_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.enforce_employee_self_update_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- HR/Admin can update any employee fields.
  IF app.is_hr_or_admin() THEN
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF app.current_employee_id() IS NULL OR OLD.employee_id <> app.current_employee_id() THEN
    RAISE EXCEPTION 'Self-service updates are allowed only for your own employee profile';
  END IF;

  -- Self-service updates are limited to personal/contact fields only.
  IF NEW.employee_code IS DISTINCT FROM OLD.employee_code
    OR NEW.first_name IS DISTINCT FROM OLD.first_name
    OR NEW.last_name IS DISTINCT FROM OLD.last_name
    OR NEW.department_id IS DISTINCT FROM OLD.department_id
    OR NEW.position IS DISTINCT FROM OLD.position
    OR NEW.attendance_status IS DISTINCT FROM OLD.attendance_status
    OR NEW.employment_status IS DISTINCT FROM OLD.employment_status
    OR NEW.employment_type IS DISTINCT FROM OLD.employment_type
    OR NEW.clock_in_time IS DISTINCT FROM OLD.clock_in_time
    OR NEW.clock_out_time IS DISTINCT FROM OLD.clock_out_time
    OR NEW.work_duration_minutes IS DISTINCT FROM OLD.work_duration_minutes
    OR NEW.late_minutes IS DISTINCT FROM OLD.late_minutes
    OR NEW.join_date IS DISTINCT FROM OLD.join_date
    OR NEW.invitation_sent_date IS DISTINCT FROM OLD.invitation_sent_date
    OR NEW.password_changed IS DISTINCT FROM OLD.password_changed
  THEN
    RAISE EXCEPTION 'You are not allowed to modify protected employee fields';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_employee_self_update_columns ON app.employees;
CREATE TRIGGER trg_enforce_employee_self_update_columns
BEFORE UPDATE ON app.employees
FOR EACH ROW
EXECUTE FUNCTION app.enforce_employee_self_update_columns();

