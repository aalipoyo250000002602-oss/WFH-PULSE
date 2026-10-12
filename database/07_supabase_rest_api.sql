BEGIN;

CREATE SCHEMA IF NOT EXISTS api;
CREATE SCHEMA IF NOT EXISTS wfh_private;
REVOKE ALL ON SCHEMA wfh_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA api, wfh_private TO authenticated;

CREATE OR REPLACE FUNCTION wfh_private.attendance_json(p_row app.attendance_records)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'attendanceId', p_row.attendance_id, 'recordType', p_row.record_type,
    'attendanceDate', p_row.attendance_date, 'status', p_row.status,
    'clockIn', to_char(p_row.clock_in, 'HH24:MI'), 'clockOut', to_char(p_row.clock_out, 'HH24:MI'),
    'workDurationMinutes', p_row.work_duration_minutes, 'lateMinutes', p_row.late_minutes,
    'totalBreakDurationMinutes', COALESCE(p_row.total_break_duration_minutes, 0),
    'isBreakActive', p_row.active_break_started_at IS NOT NULL,
    'activeBreakStartedAt', p_row.active_break_started_at
  );
$$;
REVOKE ALL ON FUNCTION wfh_private.attendance_json(app.attendance_records) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION wfh_private.request(p_path text, p_method text, p_query jsonb, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_auth_id uuid := auth.uid();
  v_user_id uuid;
  v_employee_id text;
  v_role text;
  v_privileged boolean;
  v_result jsonb;
  v_rows jsonb;
  v_extra jsonb;
  v_from date;
  v_to date;
  v_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_now timestamp := now() AT TIME ZONE 'Asia/Manila';
  v_attendance app.attendance_records%ROWTYPE;
  v_start timestamp;
  v_end timestamp;
  v_minutes integer := 0;
  v_break_minutes integer := 0;
BEGIN
  IF v_auth_id IS NULL THEN
    RETURN jsonb_build_object('status', 401, 'body', jsonb_build_object('error', 'Sign in with Supabase Auth first.'));
  END IF;
  SELECT u.user_id, COALESCE(u.employee_id, e.employee_id),
    COALESCE((SELECT r.role_name FROM app_auth.user_roles ur JOIN app_auth.roles r ON r.role_id = ur.role_id
      WHERE ur.user_id = u.user_id ORDER BY CASE r.role_name WHEN 'admin' THEN 1 WHEN 'hr_manager' THEN 2 ELSE 3 END LIMIT 1), 'employee')
  INTO v_user_id, v_employee_id, v_role
  FROM auth.users a JOIN app_auth.users u ON u.supabase_auth_user_id = a.id OR
    (u.supabase_auth_user_id IS NULL AND lower(u.email::text) = lower(a.email) AND a.email_confirmed_at IS NOT NULL)
  LEFT JOIN app.employees e ON lower(e.email::text) = lower(a.email)
  WHERE a.id = v_auth_id AND u.is_active
  ORDER BY (u.supabase_auth_user_id = a.id) DESC NULLS LAST LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('status', 403, 'body', jsonb_build_object('error', 'This Supabase account is not linked to an active application account. Contact HR/Admin.'));
  END IF;
  v_privileged := v_role IN ('admin', 'hr_manager');
  PERFORM set_config('app.user_id', v_user_id::text, true);
  PERFORM set_config('app.user_role', v_role, true);
  p_query := COALESCE(p_query, '{}'::jsonb);
  p_body := COALESCE(p_body, '{}'::jsonb);
  p_method := upper(p_method);
  IF jsonb_typeof(p_body) <> 'object' OR jsonb_typeof(p_query) <> 'object' THEN
    RETURN jsonb_build_object('status', 400, 'body', jsonb_build_object('error', 'Expected JSON objects.'));
  END IF;
  IF (p_path LIKE '/hr/%' OR p_path LIKE '/employees/%') AND NOT v_privileged THEN
    RETURN jsonb_build_object('status', 403, 'body', jsonb_build_object('error', 'Forbidden'));
  END IF;
  v_from := NULLIF(p_query->>'from', '')::date;
  v_to := NULLIF(p_query->>'to', '')::date;
  IF v_from IS NOT NULL AND v_to IS NOT NULL AND v_from > v_to THEN
    RETURN jsonb_build_object('status', 400, 'body', jsonb_build_object('error', 'The from date must be on or before to date.'));
  END IF;

  IF p_path = '/me/profile' AND p_method = 'GET' THEN
    SELECT to_jsonb(e) || jsonb_build_object('department', d.name, 'position', COALESCE(jp.name, e.position),
      'sss', pp.sss, 'tin', pp.tin, 'phil_health', pp.phil_health, 'pag_ibig', pp.pag_ibig)
    INTO v_result FROM app.employees e LEFT JOIN app.departments d ON d.department_id = e.department_id
    LEFT JOIN app.job_positions jp ON jp.position_id = e.position_id
    LEFT JOIN app.payroll_profiles pp ON pp.employee_id = e.employee_id WHERE e.employee_id = v_employee_id;
    RETURN jsonb_build_object('status', CASE WHEN v_result IS NULL THEN 404 ELSE 200 END,
      'body', jsonb_build_object('profile', v_result, 'role', v_role));

  ELSIF p_path = '/meta/employment-options' AND p_method = 'GET' THEN
    SELECT jsonb_build_object('employmentTypes',
      (SELECT jsonb_agg(enumlabel ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid = 'app.employment_type'::regtype),
      'departments', (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.name), '[]'::jsonb) FROM app.departments d),
      'positions', (SELECT COALESCE(jsonb_agg(to_jsonb(jp) ORDER BY jp.name), '[]'::jsonb) FROM app.job_positions jp)) INTO v_result;

  ELSIF p_path = '/settings/company-working-hours' AND p_method = 'GET' THEN
    SELECT jsonb_build_object('workingHours', COALESCE(jsonb_agg(to_jsonb(h) || jsonb_build_object('day', h.day_name)
      ORDER BY h.iso_day), '[]'::jsonb)) INTO v_result FROM app.company_settings_working_hours h;

  ELSIF p_path = '/settings/leave-credit-types' AND p_method = 'GET' THEN
    SELECT jsonb_build_object('leaveTypes', COALESCE(jsonb_agg(jsonb_build_object('leaveTypeId', lt.leave_type_id,
      'name', lt.name, 'defaultLimitDays', lt.default_limit_days) ORDER BY lt.name), '[]'::jsonb))
    INTO v_result FROM app.leave_types lt;

  ELSIF p_path IN ('/me/security-preferences', '/me/security-preferences/password-activities') AND p_method = 'GET' THEN
    SELECT COALESCE(jsonb_agg(items), '[]'::jsonb) INTO v_rows FROM (
      SELECT jsonb_build_object('activityId', a.activity_id, 'action', a.action, 'activityAt', a.activity_at,
        'platform', a.platform, 'status', a.status, 'isWaived', a.is_waived, 'details', a.details) AS items
      FROM app_auth.password_activities a WHERE a.user_id = v_user_id ORDER BY a.activity_at DESC LIMIT 100
    ) activity;
    SELECT jsonb_build_object('biometricLogin', COALESCE(sp.biometric_login, false),
      'biometricClockInOut', COALESCE(sp.biometric_clock_in_out, false),
      'passwordWaived', COALESCE(sp.password_waived, false), 'darkModeEnabled', u.dark_mode_enabled,
      'createdAt', sp.created_at, 'updatedAt', sp.updated_at)
    INTO v_extra FROM app_auth.users u LEFT JOIN app_auth.user_security_preferences sp ON sp.user_id = u.user_id
    WHERE u.user_id = v_user_id;
    v_result := jsonb_build_object('preferences', v_extra, 'passwordActivities', v_rows);

  ELSIF p_path = '/me/attendance/today' AND p_method = 'GET' THEN
    SELECT * INTO v_attendance FROM app.attendance_records ar
    WHERE ar.employee_id = v_employee_id AND ar.attendance_date = v_today AND ar.record_type = 'actual' LIMIT 1;
    IF v_attendance.attendance_id IS NULL THEN
      v_result := jsonb_build_object('attendance', NULL, 'currentWorkDurationMinutes', 0, 'logs', '[]'::jsonb);
    ELSE
      v_minutes := COALESCE(v_attendance.work_duration_minutes, 0);
      IF v_attendance.clock_in IS NOT NULL AND v_attendance.clock_out IS NULL THEN
        SELECT GREATEST(v_today + v_attendance.clock_in, v_today + h.start_time),
          LEAST(v_now, v_today + h.end_time) INTO v_start, v_end
        FROM app.company_settings_working_hours h WHERE h.iso_day = extract(isodow FROM v_today) AND h.is_working_day;
        IF v_start IS NOT NULL AND v_end > v_start THEN
          SELECT COALESCE(sum(GREATEST(0, floor(extract(epoch FROM (
            LEAST(COALESCE(bl.break_ended_at, now()) AT TIME ZONE 'Asia/Manila', v_end)
            - GREATEST(bl.break_started_at AT TIME ZONE 'Asia/Manila', v_start))) / 60))), 0)::integer
          INTO v_break_minutes FROM app.attendance_break_logs bl WHERE bl.attendance_id = v_attendance.attendance_id;
          v_minutes := v_minutes + GREATEST(0, floor(extract(epoch FROM (v_end - v_start)) / 60)::integer - v_break_minutes);
        END IF;
      END IF;
      SELECT COALESCE(jsonb_agg(items), '[]'::jsonb) INTO v_rows FROM (
        SELECT jsonb_build_object('activityId', lg.activity_id, 'action', lg.action, 'loggedAt', lg.logged_at, 'metadata', lg.metadata) AS items
        FROM app.attendance_activity_logs lg WHERE lg.attendance_id = v_attendance.attendance_id ORDER BY lg.logged_at DESC LIMIT 50
      ) logs;
      v_result := jsonb_build_object('attendance', wfh_private.attendance_json(v_attendance),
        'currentWorkDurationMinutes', v_minutes, 'logs', v_rows);
    END IF;

  ELSIF p_path IN ('/me/attendance', '/me/calendar') AND p_method = 'GET' THEN
    SELECT COALESCE(jsonb_agg(items ORDER BY attendance_date DESC), '[]'::jsonb) INTO v_rows FROM (
      SELECT wfh_private.attendance_json(ar) AS items, ar.attendance_date FROM app.attendance_records ar
      WHERE ar.employee_id = v_employee_id AND ar.record_type = 'actual'
        AND (v_from IS NULL OR ar.attendance_date >= v_from) AND (v_to IS NULL OR ar.attendance_date <= v_to)
      ORDER BY ar.attendance_date DESC LIMIT 400
    ) attendance;
    SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.holiday_date), '[]'::jsonb) INTO v_extra FROM app.holidays h
      WHERE (v_from IS NULL OR h.holiday_date >= v_from) AND (v_to IS NULL OR h.holiday_date <= v_to);
    v_result := jsonb_build_object('attendance', v_rows, 'holidays', v_extra);

  ELSIF p_path IN ('/employees', '/hr/employees') AND p_method = 'GET' THEN
    SELECT jsonb_build_object('employees', COALESCE(jsonb_agg(items), '[]'::jsonb)) INTO v_result FROM (
      SELECT to_jsonb(e) || jsonb_build_object('department', d.name, 'position', COALESCE(jp.name, e.position),
        'attendance_status', COALESCE(ar.status::text, 'absent'), 'clock_in_time', to_char(ar.clock_in, 'HH24:MI'),
        'clock_out_time', to_char(ar.clock_out, 'HH24:MI'), 'work_duration_minutes', ar.work_duration_minutes,
        'late_minutes', ar.late_minutes) AS items
      FROM app.employees e LEFT JOIN app.departments d ON d.department_id = e.department_id
      LEFT JOIN app.job_positions jp ON jp.position_id = e.position_id
      LEFT JOIN app.attendance_records ar ON ar.employee_id = e.employee_id AND ar.attendance_date = v_today AND ar.record_type = 'actual'
      WHERE (v_privileged OR e.employee_id = v_employee_id) ORDER BY e.first_name, e.last_name LIMIT 1000
    ) employees;

  ELSIF p_path IN ('/me/leave-requests', '/hr/leave-requests') AND p_method = 'GET' THEN
    SELECT COALESCE(jsonb_agg(items), '[]'::jsonb) INTO v_rows FROM (
      SELECT to_jsonb(lr) || jsonb_build_object('leave_type_name', COALESCE(lr.leave_type_name, lt.name),
        'employee_name', concat_ws(' ', e.first_name, e.last_name),
        'attachments', (SELECT COALESCE(jsonb_agg(jsonb_build_object('attachmentId', a.attachment_id, 'fileName', a.file_name)), '[]'::jsonb)
          FROM app.leave_request_attachments a WHERE a.request_id = lr.request_id),
        'logs', (SELECT COALESCE(jsonb_agg(jsonb_build_object('logId', lg.log_id, 'status', lg.status,
          'loggedAt', lg.logged_at, 'approvedBy', lg.approved_by, 'reason', lg.reason) ORDER BY lg.logged_at), '[]'::jsonb)
          FROM app.leave_request_logs lg WHERE lg.request_id = lr.request_id)) AS items
      FROM app.leave_requests lr LEFT JOIN app.leave_types lt ON lt.leave_type_id = lr.leave_type_id
      LEFT JOIN app.employees e ON e.employee_id = lr.employee_id
      WHERE (p_path = '/hr/leave-requests' OR lr.employee_id = v_employee_id)
        AND (NULLIF(p_query->>'status', '') IS NULL OR lr.status::text = p_query->>'status')
        AND (COALESCE(p_query->>'sourcePage', 'all') = 'all' OR lr.source_page = p_query->>'sourcePage')
      ORDER BY lr.submitted_at DESC LIMIT 300
    ) requests;
    SELECT COALESCE(jsonb_agg(to_jsonb(lt) || jsonb_build_object('credits', COALESCE(lb.credits, lt.default_limit_days),
      'accrued', COALESCE(lb.accrued, lt.default_limit_days), 'limit_days', COALESCE(lb.limit_days, lt.default_limit_days))), '[]'::jsonb)
    INTO v_extra FROM app.leave_types lt LEFT JOIN app.leave_balances lb ON lb.leave_type_id = lt.leave_type_id AND lb.employee_id = v_employee_id;
    v_result := jsonb_build_object('requests', v_rows, 'leaveTypes', v_extra);

  ELSIF p_path IN ('/me/attendance-adjustments', '/me/overtime-requests', '/hr/adjustment-requests', '/hr/overtime-requests') AND p_method = 'GET' THEN
    SELECT jsonb_build_object('requests', COALESCE(jsonb_agg(items), '[]'::jsonb)) INTO v_result FROM (
      SELECT jsonb_build_object('requestId', r.request_id, 'employeeId', r.employee_id, 'employeeName', r.employee_name,
        'position', r.position, 'department', r.department, 'requestDate', r.request_date, 'shiftDateFrom', r.shift_date_from,
        'shiftDateTo', r.shift_date_to, 'clockInTime', r.clock_in_time, 'clockOutTime', r.clock_out_time,
        'startTime', r.clock_in_time, 'endTime', r.clock_out_time, 'purpose', regexp_replace(COALESCE(r.message, ''), '^.*Purpose:\s*', '', 's'),
        'reason', r.reason, 'breakDurationMinutes', r.break_duration_minutes, 'totalWorkDurationMinutes', r.total_work_duration_minutes,
        'message', r.message, 'status', r.status, 'submittedAt', r.submitted_at, 'approvedBy', r.approved_by,
        'approvedAt', r.approved_at, 'deniedReason', r.denied_reason, 'sourcePage', r.source_page,
        'attachments', (SELECT COALESCE(jsonb_agg(jsonb_build_object('attachmentId', a.attachment_id, 'fileName', a.file_name)), '[]'::jsonb)
          FROM app.adjustment_request_attachments a WHERE a.request_id = r.request_id),
        'logs', (SELECT COALESCE(jsonb_agg(jsonb_build_object('logId', lg.log_id, 'status', lg.status,
          'loggedAt', lg.logged_at, 'approvedBy', lg.approved_by, 'reason', lg.reason) ORDER BY lg.logged_at), '[]'::jsonb)
          FROM app.adjustment_request_logs lg WHERE lg.request_id = r.request_id)) AS items
      FROM app.attendance_adjustment_requests r
      WHERE (p_path LIKE '/hr/%' OR r.employee_id = v_employee_id)
        AND ((p_path LIKE '%overtime-requests' AND r.source_page = 'home-overtime')
          OR (p_path NOT LIKE '%overtime-requests' AND r.source_page <> 'home-overtime'))
        AND (NULLIF(p_query->>'status', '') IS NULL OR r.status::text = p_query->>'status')
        AND (v_from IS NULL OR r.request_date >= v_from) AND (v_to IS NULL OR r.request_date <= v_to)
      ORDER BY r.submitted_at DESC LIMIT 300
    ) requests;

  ELSIF p_path = '/settings/holidays' AND p_method = 'GET' THEN
    IF v_role <> 'admin' THEN RETURN jsonb_build_object('status', 403, 'body', jsonb_build_object('error', 'Forbidden')); END IF;
    SELECT jsonb_build_object('holidays', COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.holiday_date), '[]'::jsonb))
    INTO v_result FROM app.holidays h WHERE (v_from IS NULL OR h.holiday_date >= v_from) AND (v_to IS NULL OR h.holiday_date <= v_to);

  ELSE
    RETURN jsonb_build_object('status', 501, 'body', jsonb_build_object('error', 'This operation has not yet been migrated to the Supabase Data API.', 'path', p_path, 'method', p_method));
  END IF;
  RETURN jsonb_build_object('status', 200, 'body', COALESCE(v_result, '{}'::jsonb));
EXCEPTION
  WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
    RETURN jsonb_build_object('status', 400, 'body', jsonb_build_object('error', 'Invalid date, identifier, or input value.'));
END;
$$;
REVOKE ALL ON FUNCTION wfh_private.request(text, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION wfh_private.request(text, text, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION api.wfh_pulse_request(
  p_path text, p_method text DEFAULT 'GET', p_query jsonb DEFAULT '{}'::jsonb, p_body jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT wfh_private.request(p_path, p_method, p_query, p_body);
$$;
REVOKE ALL ON FUNCTION api.wfh_pulse_request(text, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.wfh_pulse_request(text, text, jsonb, jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';

COMMIT;