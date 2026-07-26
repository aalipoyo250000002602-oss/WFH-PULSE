-- Row-level security policies for app data access.
-- Access model:
-- - employee: self-service on own data
-- - hr_manager/admin: elevated access

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_user_id TEXT;
BEGIN
  v_user_id := current_setting('app.user_id', true);
  IF v_user_id IS NULL OR btrim(v_user_id) = '' THEN
    RETURN NULL;
  END IF;
  RETURN v_user_id::UUID;
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.current_role()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := current_setting('app.user_role', true);
  IF v_role IS NULL THEN
    RETURN '';
  END IF;
  RETURN lower(v_role);
END;
$$;

CREATE OR REPLACE FUNCTION app.current_employee_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT u.employee_id
  FROM auth.users u
  WHERE u.user_id = app.current_user_id();
$$;

CREATE OR REPLACE FUNCTION app.is_hr_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT app.current_role() IN ('hr_manager', 'admin');
$$;

ALTER TABLE app.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.payroll_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.payroll_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.attendance_leave_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.attendance_leave_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.attendance_adjustment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.adjustment_request_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.adjustment_request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.leave_request_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.leave_request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.user_working_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employees_select ON app.employees;
CREATE POLICY employees_select ON app.employees
  FOR SELECT USING (
    app.is_hr_or_admin() OR employee_id = app.current_employee_id()
  );

DROP POLICY IF EXISTS employees_update ON app.employees;
CREATE POLICY employees_update ON app.employees
  FOR UPDATE USING (
    app.is_hr_or_admin() OR employee_id = app.current_employee_id()
  )
  WITH CHECK (
    app.is_hr_or_admin() OR employee_id = app.current_employee_id()
  );

DROP POLICY IF EXISTS employees_insert ON app.employees;
CREATE POLICY employees_insert ON app.employees
  FOR INSERT WITH CHECK (app.is_hr_or_admin());

DROP POLICY IF EXISTS employees_delete ON app.employees;
CREATE POLICY employees_delete ON app.employees
  FOR DELETE USING (app.is_hr_or_admin());

DROP POLICY IF EXISTS payroll_profiles_select ON app.payroll_profiles;
CREATE POLICY payroll_profiles_select ON app.payroll_profiles
  FOR SELECT USING (
    app.is_hr_or_admin() OR employee_id = app.current_employee_id()
  );

DROP POLICY IF EXISTS payroll_profiles_write ON app.payroll_profiles;
CREATE POLICY payroll_profiles_write ON app.payroll_profiles
  FOR ALL USING (app.is_hr_or_admin())
  WITH CHECK (app.is_hr_or_admin());

DROP POLICY IF EXISTS payroll_deductions_select ON app.payroll_deductions;
CREATE POLICY payroll_deductions_select ON app.payroll_deductions
  FOR SELECT USING (
    app.is_hr_or_admin() OR employee_id = app.current_employee_id()
  );

DROP POLICY IF EXISTS payroll_deductions_write ON app.payroll_deductions;
CREATE POLICY payroll_deductions_write ON app.payroll_deductions
  FOR ALL USING (app.is_hr_or_admin())
  WITH CHECK (app.is_hr_or_admin());

DROP POLICY IF EXISTS attendance_records_select ON app.attendance_records;
CREATE POLICY attendance_records_select ON app.attendance_records
  FOR SELECT USING (
    app.is_hr_or_admin() OR employee_id = app.current_employee_id()
  );

DROP POLICY IF EXISTS attendance_records_write ON app.attendance_records;
CREATE POLICY attendance_records_write ON app.attendance_records
  FOR ALL USING (
    app.is_hr_or_admin() OR employee_id = app.current_employee_id()
  )
  WITH CHECK (
    app.is_hr_or_admin() OR employee_id = app.current_employee_id()
  );

DROP POLICY IF EXISTS leave_details_select ON app.attendance_leave_details;
CREATE POLICY leave_details_select ON app.attendance_leave_details
  FOR SELECT USING (
    app.is_hr_or_admin() OR EXISTS (
      SELECT 1
      FROM app.attendance_records ar
      WHERE ar.attendance_id = attendance_leave_details.attendance_id
        AND ar.employee_id = app.current_employee_id()
    )
  );

DROP POLICY IF EXISTS leave_details_write ON app.attendance_leave_details;
CREATE POLICY leave_details_write ON app.attendance_leave_details
  FOR ALL USING (app.is_hr_or_admin())
  WITH CHECK (app.is_hr_or_admin());

DROP POLICY IF EXISTS leave_attachments_select ON app.attendance_leave_attachments;
CREATE POLICY leave_attachments_select ON app.attendance_leave_attachments
  FOR SELECT USING (
    app.is_hr_or_admin() OR EXISTS (
      SELECT 1
      FROM app.attendance_records ar
      WHERE ar.attendance_id = attendance_leave_attachments.attendance_id
        AND ar.employee_id = app.current_employee_id()
    )
  );

DROP POLICY IF EXISTS leave_attachments_write ON app.attendance_leave_attachments;
CREATE POLICY leave_attachments_write ON app.attendance_leave_attachments
  FOR ALL USING (app.is_hr_or_admin())
  WITH CHECK (app.is_hr_or_admin());

DROP POLICY IF EXISTS adjustment_requests_select ON app.attendance_adjustment_requests;
CREATE POLICY adjustment_requests_select ON app.attendance_adjustment_requests
  FOR SELECT USING (
    app.is_hr_or_admin() OR employee_id = app.current_employee_id()
  );

DROP POLICY IF EXISTS adjustment_requests_write ON app.attendance_adjustment_requests;
CREATE POLICY adjustment_requests_write ON app.attendance_adjustment_requests
  FOR ALL USING (
    app.is_hr_or_admin() OR employee_id = app.current_employee_id()
  )
  WITH CHECK (
    app.is_hr_or_admin() OR employee_id = app.current_employee_id()
  );

DROP POLICY IF EXISTS adjustment_attachments_select ON app.adjustment_request_attachments;
CREATE POLICY adjustment_attachments_select ON app.adjustment_request_attachments
  FOR SELECT USING (
    app.is_hr_or_admin() OR EXISTS (
      SELECT 1
      FROM app.attendance_adjustment_requests r
      WHERE r.request_id = adjustment_request_attachments.request_id
        AND r.employee_id = app.current_employee_id()
    )
  );

DROP POLICY IF EXISTS adjustment_attachments_write ON app.adjustment_request_attachments;
CREATE POLICY adjustment_attachments_write ON app.adjustment_request_attachments
  FOR ALL USING (
    app.is_hr_or_admin() OR EXISTS (
      SELECT 1
      FROM app.attendance_adjustment_requests r
      WHERE r.request_id = adjustment_request_attachments.request_id
        AND r.employee_id = app.current_employee_id()
    )
  )
  WITH CHECK (
    app.is_hr_or_admin() OR EXISTS (
      SELECT 1
      FROM app.attendance_adjustment_requests r
      WHERE r.request_id = adjustment_request_attachments.request_id
        AND r.employee_id = app.current_employee_id()
    )
  );

DROP POLICY IF EXISTS adjustment_logs_select ON app.adjustment_request_logs;
CREATE POLICY adjustment_logs_select ON app.adjustment_request_logs
  FOR SELECT USING (
    app.is_hr_or_admin() OR EXISTS (
      SELECT 1
      FROM app.attendance_adjustment_requests r
      WHERE r.request_id = adjustment_request_logs.request_id
        AND r.employee_id = app.current_employee_id()
    )
  );

DROP POLICY IF EXISTS adjustment_logs_write ON app.adjustment_request_logs;
CREATE POLICY adjustment_logs_write ON app.adjustment_request_logs
  FOR ALL USING (app.is_hr_or_admin())
  WITH CHECK (app.is_hr_or_admin());

DROP POLICY IF EXISTS leave_balances_select ON app.leave_balances;
CREATE POLICY leave_balances_select ON app.leave_balances
  FOR SELECT USING (
    app.is_hr_or_admin() OR employee_id = app.current_employee_id()
  );

DROP POLICY IF EXISTS leave_balances_write ON app.leave_balances;
CREATE POLICY leave_balances_write ON app.leave_balances
  FOR ALL USING (app.is_hr_or_admin())
  WITH CHECK (app.is_hr_or_admin());

DROP POLICY IF EXISTS leave_requests_select ON app.leave_requests;
CREATE POLICY leave_requests_select ON app.leave_requests
  FOR SELECT USING (
    app.is_hr_or_admin() OR employee_id = app.current_employee_id()
  );

DROP POLICY IF EXISTS leave_requests_write ON app.leave_requests;
CREATE POLICY leave_requests_write ON app.leave_requests
  FOR ALL USING (
    app.is_hr_or_admin() OR employee_id = app.current_employee_id()
  )
  WITH CHECK (
    app.is_hr_or_admin() OR employee_id = app.current_employee_id()
  );

DROP POLICY IF EXISTS leave_request_attachments_select ON app.leave_request_attachments;
CREATE POLICY leave_request_attachments_select ON app.leave_request_attachments
  FOR SELECT USING (
    app.is_hr_or_admin() OR EXISTS (
      SELECT 1
      FROM app.leave_requests lr
      WHERE lr.request_id = leave_request_attachments.request_id
        AND lr.employee_id = app.current_employee_id()
    )
  );

DROP POLICY IF EXISTS leave_request_attachments_write ON app.leave_request_attachments;
CREATE POLICY leave_request_attachments_write ON app.leave_request_attachments
  FOR ALL USING (
    app.is_hr_or_admin() OR EXISTS (
      SELECT 1
      FROM app.leave_requests lr
      WHERE lr.request_id = leave_request_attachments.request_id
        AND lr.employee_id = app.current_employee_id()
    )
  )
  WITH CHECK (
    app.is_hr_or_admin() OR EXISTS (
      SELECT 1
      FROM app.leave_requests lr
      WHERE lr.request_id = leave_request_attachments.request_id
        AND lr.employee_id = app.current_employee_id()
    )
  );

DROP POLICY IF EXISTS leave_request_logs_select ON app.leave_request_logs;
CREATE POLICY leave_request_logs_select ON app.leave_request_logs
  FOR SELECT USING (
    app.is_hr_or_admin() OR EXISTS (
      SELECT 1
      FROM app.leave_requests lr
      WHERE lr.request_id = leave_request_logs.request_id
        AND lr.employee_id = app.current_employee_id()
    )
  );

DROP POLICY IF EXISTS leave_request_logs_write ON app.leave_request_logs;
CREATE POLICY leave_request_logs_write ON app.leave_request_logs
  FOR ALL USING (app.is_hr_or_admin())
  WITH CHECK (app.is_hr_or_admin());

DROP POLICY IF EXISTS user_preferences_policy ON app.user_preferences;
CREATE POLICY user_preferences_policy ON app.user_preferences
  FOR ALL USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

DROP POLICY IF EXISTS user_working_days_policy ON app.user_working_days;
CREATE POLICY user_working_days_policy ON app.user_working_days
  FOR ALL USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

DROP POLICY IF EXISTS holidays_select ON app.holidays;
CREATE POLICY holidays_select ON app.holidays
  FOR SELECT USING (true);

DROP POLICY IF EXISTS holidays_write ON app.holidays;
CREATE POLICY holidays_write ON app.holidays
  FOR ALL USING (app.is_hr_or_admin())
  WITH CHECK (app.is_hr_or_admin());

