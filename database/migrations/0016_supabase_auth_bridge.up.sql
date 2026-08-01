ALTER TABLE app_auth.users
  ADD COLUMN IF NOT EXISTS supabase_auth_user_id UUID UNIQUE;

CREATE INDEX IF NOT EXISTS idx_app_auth_users_supabase_auth_user_id
  ON app_auth.users (supabase_auth_user_id)
  WHERE supabase_auth_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app_auth.link_supabase_user(
  p_supabase_user_id UUID,
  p_email CITEXT,
  p_employee_id TEXT DEFAULT NULL,
  p_default_role TEXT DEFAULT 'employee'
) RETURNS TABLE (
  user_id UUID,
  role_name TEXT,
  employee_id TEXT,
  email CITEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
  v_role_id BIGINT;
  v_employee_id TEXT;
BEGIN
  IF p_supabase_user_id IS NULL THEN
    RAISE EXCEPTION 'Supabase user id is required';
  END IF;

  IF p_email IS NULL OR btrim(p_email::text) = '' THEN
    RAISE EXCEPTION 'Supabase email is required';
  END IF;

  IF p_default_role IS NULL OR btrim(p_default_role) = '' THEN
    p_default_role := 'employee';
  END IF;

  SELECT e.employee_id
    INTO v_employee_id
  FROM app.employees e
  WHERE (
      p_employee_id IS NOT NULL
      AND (
        e.employee_id = p_employee_id
        OR e.employee_code = p_employee_id
        OR lower(e.employee_id) = lower(p_employee_id)
        OR lower(e.employee_code) = lower(p_employee_id)
      )
    )
     OR e.email = p_email
  ORDER BY CASE
    WHEN p_employee_id IS NOT NULL AND e.employee_id = p_employee_id THEN 1
    WHEN p_employee_id IS NOT NULL AND e.employee_code = p_employee_id THEN 2
    WHEN p_employee_id IS NOT NULL AND lower(e.employee_id) = lower(p_employee_id) THEN 3
    WHEN p_employee_id IS NOT NULL AND lower(e.employee_code) = lower(p_employee_id) THEN 4
    WHEN e.email = p_email THEN 5
    ELSE 99
  END
  LIMIT 1;

  SELECT u.user_id
    INTO v_user_id
  FROM app_auth.users u
  WHERE u.supabase_auth_user_id = p_supabase_user_id
     OR u.email = p_email
  ORDER BY CASE
    WHEN u.supabase_auth_user_id = p_supabase_user_id THEN 1
    WHEN u.email = p_email THEN 2
    ELSE 99
  END
  LIMIT 1;

  IF v_user_id IS NULL THEN
    INSERT INTO app_auth.users (
      supabase_auth_user_id,
      employee_id,
      email,
      password_hash,
      is_active
    )
    VALUES (
      p_supabase_user_id,
      v_employee_id,
      p_email,
      crypt(gen_random_uuid()::text, gen_salt('bf', 10)),
      TRUE
    )
    RETURNING app_auth.users.user_id
      INTO v_user_id;
  ELSE
    UPDATE app_auth.users u
    SET
      supabase_auth_user_id = COALESCE(u.supabase_auth_user_id, p_supabase_user_id),
      employee_id = COALESCE(u.employee_id, v_employee_id),
      email = p_email,
      is_active = TRUE,
      updated_at = NOW()
    WHERE u.user_id = v_user_id;
  END IF;

  INSERT INTO app_auth.roles (role_name)
  VALUES (p_default_role)
  ON CONFLICT (role_name) DO NOTHING;

  SELECT r.role_id
    INTO v_role_id
  FROM app_auth.roles r
  WHERE r.role_name = p_default_role;

  INSERT INTO app_auth.user_roles (user_id, role_id)
  VALUES (v_user_id, v_role_id)
  ON CONFLICT DO NOTHING;

  RETURN QUERY
  SELECT
    u.user_id,
    COALESCE(
      (
        SELECT r.role_name
        FROM app_auth.user_roles ur
        JOIN app_auth.roles r ON r.role_id = ur.role_id
        WHERE ur.user_id = u.user_id
        ORDER BY CASE r.role_name
          WHEN 'admin' THEN 1
          WHEN 'hr_manager' THEN 2
          WHEN 'employee' THEN 3
          ELSE 99
        END,
        r.role_name ASC
        LIMIT 1
      ),
      p_default_role
    ) AS role_name,
    u.employee_id,
    u.email
  FROM app_auth.users u
  WHERE u.user_id = v_user_id;
END;
$$;
