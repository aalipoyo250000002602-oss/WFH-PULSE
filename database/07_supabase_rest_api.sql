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

CREATE OR REPLACE FUNCTION wfh_private.active_session_minutes(p_row app.attendance_records)
RETURNS integer LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH session_window AS (
    SELECT GREATEST(p_row.attendance_date + p_row.clock_in, p_row.attendance_date + h.start_time) AS starts,
      LEAST(now() AT TIME ZONE 'Asia/Manila', p_row.attendance_date + h.end_time) AS ends
    FROM app.company_settings_working_hours h
    WHERE h.iso_day = extract(isodow FROM p_row.attendance_date) AND h.is_working_day
  ), duration AS (
    SELECT GREATEST(0, floor(extract(epoch FROM (ends - starts)) / 60)) AS gross,
      COALESCE((SELECT sum(GREATEST(0, floor(extract(epoch FROM (
        LEAST(COALESCE(bl.break_ended_at, now()) AT TIME ZONE 'Asia/Manila', w.ends)
        - GREATEST(bl.break_started_at AT TIME ZONE 'Asia/Manila', w.starts))) / 60)))
        FROM app.attendance_break_logs bl WHERE bl.attendance_id = p_row.attendance_id), 0) AS breaks
    FROM session_window w
  ) SELECT COALESCE((SELECT GREATEST(0, gross - breaks)::integer FROM duration), 0);
$$;
REVOKE ALL ON FUNCTION wfh_private.active_session_minutes(app.attendance_records) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION wfh_private.leave_days(p_start date,p_end date)
RETURNS integer LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT count(*)::integer FROM generate_series(p_start::timestamp,p_end::timestamp,interval '1 day') day
  WHERE extract(isodow FROM day)<6 AND NOT EXISTS(
    SELECT 1 FROM app.holidays holiday WHERE holiday.holiday_date=day::date
    UNION ALL SELECT 1 FROM app.holiday_subdivision_holidays holiday WHERE holiday.holiday_date=day::date);
$$;
REVOKE ALL ON FUNCTION wfh_private.leave_days(date,date) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wfh_private.effective_attendance(p_employee text,p_from date,p_to date)
RETURNS TABLE(attendance_id bigint,attendance_date date,status app.attendance_status,clock_in time,clock_out time,
  work_duration_minutes integer,late_minutes integer,total_break_duration_minutes integer,active_break_started_at timestamptz)
LANGUAGE sql STABLE SET search_path='' AS $$
  WITH dates AS (
    SELECT ar.attendance_date FROM app.attendance_records ar WHERE ar.employee_id=p_employee
      AND (p_from IS NULL OR ar.attendance_date>=p_from) AND (p_to IS NULL OR ar.attendance_date<=p_to)
    UNION SELECT day::date FROM app.leave_requests lr
      CROSS JOIN LATERAL generate_series(lr.start_date::timestamp,lr.end_date::timestamp,interval '1 day') day
      WHERE lr.employee_id=p_employee AND lr.status='approved'
        AND (p_from IS NULL OR day::date>=p_from) AND (p_to IS NULL OR day::date<=p_to)
  ) SELECT COALESCE(actual.attendance_id,adjusted.attendance_id,0),dates.attendance_date,
      CASE WHEN leave_request.request_id IS NOT NULL THEN 'on-leave'::app.attendance_status
        ELSE COALESCE(adjusted.status,actual.status,'absent'::app.attendance_status) END,
      COALESCE(adjusted.clock_in,actual.clock_in),COALESCE(adjusted.clock_out,actual.clock_out),
      (CASE WHEN leave_request.request_id IS NOT NULL THEN 480 ELSE COALESCE(adjusted.work_duration_minutes,actual.work_duration_minutes,0) END
        +COALESCE(overtime.minutes,0))::integer,
      COALESCE(adjusted.late_minutes,actual.late_minutes,0),COALESCE(adjusted.total_break_duration_minutes,actual.total_break_duration_minutes,0),
      actual.active_break_started_at
    FROM dates
    LEFT JOIN LATERAL(SELECT * FROM app.attendance_records ar WHERE ar.employee_id=p_employee
      AND ar.attendance_date=dates.attendance_date AND ar.record_type='actual' LIMIT 1) actual ON true
    LEFT JOIN LATERAL(SELECT * FROM app.attendance_records ar WHERE ar.employee_id=p_employee
      AND ar.attendance_date=dates.attendance_date AND ar.record_type='adjusted' AND ar.approval_status='approved'
      ORDER BY ar.attendance_id DESC LIMIT 1) adjusted ON true
    LEFT JOIN LATERAL(SELECT sum(ar.work_duration_minutes) AS minutes FROM app.attendance_records ar WHERE ar.employee_id=p_employee
      AND ar.attendance_date=dates.attendance_date AND ar.record_type='overtime' AND ar.approval_status='approved') overtime ON true
    LEFT JOIN LATERAL(SELECT lr.request_id FROM app.leave_requests lr WHERE lr.employee_id=p_employee AND lr.status='approved'
      AND dates.attendance_date BETWEEN lr.start_date AND lr.end_date LIMIT 1) leave_request ON true
    ORDER BY dates.attendance_date;
$$;
REVOKE ALL ON FUNCTION wfh_private.effective_attendance(text,date,date) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wfh_private.payroll_report(p_employee text,p_from date,p_to date)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  WITH employee AS (
    SELECT e.*,d.name AS department,COALESCE(jp.name,e.position) AS position_name,COALESCE(pp.salary,0) AS salary,
      pp.pag_ibig,pp.phil_health,pp.sss,pp.tin FROM app.employees e
      LEFT JOIN app.departments d ON d.department_id=e.department_id LEFT JOIN app.job_positions jp ON jp.position_id=e.position_id
      LEFT JOIN app.payroll_profiles pp ON pp.employee_id=e.employee_id WHERE e.employee_id=p_employee
  ), records AS (SELECT * FROM wfh_private.effective_attendance(p_employee,p_from,p_to)), totals AS (
    SELECT count(*) FILTER(WHERE status IN ('present','late')) AS present,count(*) FILTER(WHERE status='absent') AS absent,
      count(*) FILTER(WHERE status='on-leave') AS leave_days,count(*) FILTER(WHERE status='holiday') AS holidays,
      count(*) FILTER(WHERE status='late' OR (status IN ('present','late') AND late_minutes>0)) AS late_days,
      COALESCE(sum(GREATEST(work_duration_minutes,0)),0) AS work_minutes,COALESCE(sum(GREATEST(late_minutes,0)),0) AS late_minutes
    FROM records
  ), deductions AS (
    SELECT COALESCE(sum(amount),0) AS total,COALESCE(jsonb_agg(jsonb_build_object('id',deduction_id,'name',deduction_name,'amount',round(amount,2)) ORDER BY deduction_id),'[]') AS items
    FROM app.payroll_deductions WHERE employee_id=p_employee
  ), earnings AS (
    SELECT COALESCE(sum(amount),0) AS total,COALESCE(jsonb_agg(jsonb_build_object('id',earning_id,'name',earning_name,'amount',round(amount,2)) ORDER BY earning_id),'[]') AS items
    FROM app.payroll_other_earnings WHERE employee_id=p_employee
  ) SELECT jsonb_build_object('employee',jsonb_build_object('employeeId',e.employee_id,'employeeCode',e.employee_code,
    'firstName',e.first_name,'lastName',e.last_name,'email',e.email,'department',e.department,'position',e.position_name,
    'governmentIds',jsonb_build_object('pagIbig',COALESCE(e.pag_ibig,''),'philHealth',COALESCE(e.phil_health,''),'sss',COALESCE(e.sss,''),'tin',COALESCE(e.tin,''))),
    'period',jsonb_build_object('from',p_from,'to',p_to),
    'records',(SELECT COALESCE(jsonb_agg(jsonb_build_object('date',attendance_date,'status',status,'clockInTime',to_char(clock_in,'HH24:MI'),
      'clockOutTime',to_char(clock_out,'HH24:MI'),'workDurationMinutes',work_duration_minutes,'lateMinutes',late_minutes) ORDER BY attendance_date),'[]') FROM records),
    'attendance',jsonb_build_object('presentDays',t.present,'absentDays',t.absent,'leaveDays',t.leave_days,'holidayDays',t.holidays,
      'lateDays',t.late_days,'totalWorkMinutes',t.work_minutes,'totalLateMinutes',t.late_minutes),
    'payroll',jsonb_build_object('salary',round(e.salary,2),'dailyRate',round(e.salary/21,2),'hourlyRate',round(e.salary/168,2),
      'totalWorkHoursDecimal',round(t.work_minutes/60::numeric,2),'totalWorkEarnings',round(t.work_minutes*e.salary/10080,2),
      'otherEarnings',earn.items,'totalOtherEarnings',round(earn.total,2),'totalLateHoursDecimal',round(t.late_minutes/60::numeric,2),
      'lateDeduction',round(t.late_minutes*e.salary/10080,2),'payrollDeductions',ded.items,'totalPayrollDeductions',round(ded.total,2),
      'grossPay',round(t.work_minutes*e.salary/10080+earn.total,2),'totalDeductions',round(ded.total+t.late_minutes*e.salary/10080,2),
      'netPay',round((t.work_minutes-t.late_minutes)*e.salary/10080+earn.total-ded.total,2)))
    FROM employee e CROSS JOIN totals t CROSS JOIN deductions ded CROSS JOIN earnings earn;
$$;
REVOKE ALL ON FUNCTION wfh_private.payroll_report(text,date,date) FROM PUBLIC,anon,authenticated;

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
  v_schedule app.company_settings_working_hours%ROWTYPE;
  v_break app.attendance_break_logs%ROWTYPE;
  v_action text;
  v_status integer := 200;
  v_item jsonb;
  v_fields jsonb;
  v_assignments text;
  v_target_employee text;
  v_count integer;
  v_request_id text;
  v_leave app.leave_requests%ROWTYPE;
  v_adjustment app.attendance_adjustment_requests%ROWTYPE;
  v_leave_type app.leave_types%ROWTYPE;
  v_employee app.employees%ROWTYPE;
  v_is_leave boolean;
  v_is_overtime boolean;
  v_transition text;
  v_list_path text;
  v_credits integer;
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

  IF p_path IN ('/me/attendance/clock-in', '/me/attendance/clock-out', '/me/attendance/break/start', '/me/attendance/break/end')
    AND p_method = 'POST' THEN
    IF v_employee_id IS NULL THEN
      RETURN jsonb_build_object('status', 404, 'body', jsonb_build_object('error', 'No employee profile is linked to this account.'));
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_employee_id || ':' || v_today::text, 0));
    SELECT * INTO v_attendance FROM app.attendance_records
      WHERE employee_id = v_employee_id AND attendance_date = v_today AND record_type = 'actual' FOR UPDATE;
    IF p_path = '/me/attendance/clock-in' THEN
      IF v_attendance.clock_in IS NOT NULL AND v_attendance.clock_out IS NULL THEN
        RETURN jsonb_build_object('status', 400, 'body', jsonb_build_object('error', 'You are already clocked in for today.'));
      END IF;
      IF v_attendance.attendance_id IS NULL THEN
        SELECT * INTO v_schedule FROM app.company_settings_working_hours WHERE iso_day = extract(isodow FROM v_today);
        v_minutes := CASE WHEN v_schedule.is_working_day AND v_now::time >= (v_schedule.start_time + interval '15 minutes')::time
          THEN GREATEST(0, floor(extract(epoch FROM (v_now::time - v_schedule.start_time)) / 60)::integer) ELSE 0 END;
        INSERT INTO app.attendance_records(employee_id, attendance_date, record_type, status, clock_in,
          work_duration_minutes, late_minutes, total_break_duration_minutes)
        VALUES(v_employee_id, v_today, 'actual', CASE WHEN v_minutes >= 15 THEN 'late'::app.attendance_status ELSE 'present'::app.attendance_status END,
          v_now::time, 0, v_minutes, 0) RETURNING * INTO v_attendance;
      ELSE
        UPDATE app.attendance_records SET clock_in = v_now::time, clock_out = NULL, active_break_started_at = NULL,
          status = CASE WHEN COALESCE(late_minutes, 0) >= 15 THEN 'late'::app.attendance_status ELSE 'present'::app.attendance_status END
          WHERE attendance_id = v_attendance.attendance_id RETURNING * INTO v_attendance;
      END IF;
      v_action := 'clock_in';
      v_status := 201;
    ELSE
      IF v_attendance.clock_in IS NULL OR v_attendance.clock_out IS NOT NULL THEN
        RETURN jsonb_build_object('status', 400, 'body', jsonb_build_object('error', 'No active shift found. Please clock in first.'));
      END IF;
      SELECT * INTO v_break FROM app.attendance_break_logs
        WHERE attendance_id = v_attendance.attendance_id AND break_ended_at IS NULL FOR UPDATE;
      IF p_path = '/me/attendance/break/start' THEN
        IF v_attendance.active_break_started_at IS NOT NULL OR v_break.break_id IS NOT NULL THEN
          RETURN jsonb_build_object('status', 400, 'body', jsonb_build_object('error', 'A break is already in progress.'));
        END IF;
        INSERT INTO app.attendance_break_logs(attendance_id, break_started_at)
          VALUES(v_attendance.attendance_id, now()) RETURNING * INTO v_break;
        UPDATE app.attendance_records SET active_break_started_at = now()
          WHERE attendance_id = v_attendance.attendance_id RETURNING * INTO v_attendance;
        v_action := 'break_start';
        v_status := 201;
      ELSIF p_path = '/me/attendance/break/end' THEN
        IF v_attendance.active_break_started_at IS NULL OR v_break.break_id IS NULL THEN
          RETURN jsonb_build_object('status', 400, 'body', jsonb_build_object('error', 'No active break found.'));
        END IF;
        v_break_minutes := GREATEST(0, floor(extract(epoch FROM (now() - v_break.break_started_at)) / 60)::integer);
        UPDATE app.attendance_break_logs SET break_ended_at = now(), break_duration_minutes = v_break_minutes
          WHERE break_id = v_break.break_id RETURNING * INTO v_break;
        UPDATE app.attendance_records SET active_break_started_at = NULL,
          total_break_duration_minutes = COALESCE(total_break_duration_minutes, 0) + v_break_minutes
          WHERE attendance_id = v_attendance.attendance_id RETURNING * INTO v_attendance;
        v_action := 'break_end';
      ELSE
        IF v_attendance.active_break_started_at IS NOT NULL OR v_break.break_id IS NOT NULL THEN
          RETURN jsonb_build_object('status', 400, 'body', jsonb_build_object('error', 'Please end your break before clocking out.'));
        END IF;
        v_minutes := COALESCE(v_attendance.work_duration_minutes, 0) + wfh_private.active_session_minutes(v_attendance);
        UPDATE app.attendance_records SET clock_out = v_now::time, work_duration_minutes = v_minutes,
          status = CASE WHEN v_minutes < 480 THEN 'absent'::app.attendance_status
            WHEN COALESCE(late_minutes, 0) >= 15 THEN 'late'::app.attendance_status ELSE 'present'::app.attendance_status END
          WHERE attendance_id = v_attendance.attendance_id RETURNING * INTO v_attendance;
        v_action := 'clock_out';
      END IF;
    END IF;
    INSERT INTO app.attendance_activity_logs(attendance_id, employee_id, action, metadata)
      VALUES(v_attendance.attendance_id, v_employee_id, v_action,
        jsonb_build_object('source', 'home', 'breakId', v_break.break_id, 'breakDurationMinutes', v_break_minutes));
    v_result := jsonb_build_object('attendance', wfh_private.attendance_json(v_attendance));
    IF v_action IN ('break_start', 'break_end') THEN
      v_result := v_result || jsonb_build_object('breakLog', jsonb_build_object('breakId', v_break.break_id,
        'breakStartedAt', v_break.break_started_at, 'breakEndedAt', v_break.break_ended_at,
        'breakDurationMinutes', v_break.break_duration_minutes));
    END IF;

  ELSIF (p_path = '/me/profile' OR p_path ~ '^/employees/[^/]+$') AND p_method = 'PATCH' THEN
    v_target_employee := CASE WHEN p_path = '/me/profile' THEN v_employee_id ELSE split_part(p_path, '/', 3) END;
    SELECT employee_id INTO v_target_employee FROM app.employees
      WHERE employee_id = v_target_employee OR employee_code = v_target_employee LIMIT 1;
    IF v_target_employee IS NULL THEN
      RETURN jsonb_build_object('status', 404, 'body', jsonb_build_object('error', 'Employee not found.'));
    END IF;
    v_fields := jsonb_build_object('email','email','phone','phone','birthday','birthday','gender','gender',
      'nationality','nationality','maritalStatus','marital_status','address','address','profilePictureUrl','profile_picture_url');
    IF v_privileged THEN
      v_fields := v_fields || jsonb_build_object('firstName','first_name','lastName','last_name','departmentId','department_id',
        'employmentType','employment_type','employmentStatus','employment_status','position','position','positionId','position_id',
        'joinDate','join_date','invitationSentDate','invitation_sent_date','passwordChanged','password_changed');
    END IF;
    IF p_body = '{}'::jsonb OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_body) key
      WHERE NOT v_fields ? key AND key NOT IN ('sssNumber','tinNumber','philhealthNumber','pagibigNumber')) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Only permitted profile fields can be changed.';
    END IF;
    SELECT string_agg(format('%I = ($1->>%L)::%s', a.attname, fields.key, format_type(a.atttypid,a.atttypmod)), ', ')
    INTO v_assignments FROM jsonb_each_text(v_fields) fields
    JOIN pg_attribute a ON a.attrelid='app.employees'::regclass AND a.attname=fields.value
    WHERE p_body ? fields.key;
    IF v_assignments IS NOT NULL THEN
      EXECUTE format('UPDATE app.employees SET %s, updated_at=now() WHERE employee_id=$2', v_assignments)
        USING p_body, v_target_employee;
    END IF;
    IF p_body ?| ARRAY['sssNumber','tinNumber','philhealthNumber','pagibigNumber'] THEN
      INSERT INTO app.payroll_profiles(employee_id,salary) VALUES(v_target_employee,0) ON CONFLICT DO NOTHING;
      UPDATE app.payroll_profiles SET
        sss=CASE WHEN p_body ? 'sssNumber' THEN p_body->>'sssNumber' ELSE sss END,
        tin=CASE WHEN p_body ? 'tinNumber' THEN p_body->>'tinNumber' ELSE tin END,
        phil_health=CASE WHEN p_body ? 'philhealthNumber' THEN p_body->>'philhealthNumber' ELSE phil_health END,
        pag_ibig=CASE WHEN p_body ? 'pagibigNumber' THEN p_body->>'pagibigNumber' ELSE pag_ibig END, updated_at=now()
      WHERE employee_id=v_target_employee;
    END IF;
    IF p_path='/me/profile' THEN
      RETURN wfh_private.request('/me/profile','GET','{}','{}');
    END IF;
    SELECT jsonb_build_object('employee',to_jsonb(e)) INTO v_result FROM app.employees e WHERE employee_id=v_target_employee;

  ELSIF p_path='/me/security-preferences' AND p_method IN ('POST','PUT','DELETE') THEN
    IF p_method='DELETE' THEN
      DELETE FROM app_auth.user_security_preferences WHERE user_id=v_user_id;
      GET DIAGNOSTICS v_count=ROW_COUNT;
      v_result:=jsonb_build_object('deleted',v_count>0);
    ELSE
      IF EXISTS(SELECT 1 FROM jsonb_each(p_body) field WHERE field.key NOT IN
        ('biometricLogin','biometricClockInOut','passwordWaived','darkModeEnabled') OR jsonb_typeof(field.value)<>'boolean') THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Security preferences must be boolean values.';
      END IF;
      IF p_method='POST' AND EXISTS(SELECT 1 FROM app_auth.user_security_preferences WHERE user_id=v_user_id) THEN
        RETURN jsonb_build_object('status',409,'body',jsonb_build_object('error','Security preferences already exist.'));
      END IF;
      INSERT INTO app_auth.user_security_preferences(user_id,biometric_login,biometric_clock_in_out,password_waived)
      VALUES(v_user_id,COALESCE((p_body->>'biometricLogin')::boolean,false),
        COALESCE((p_body->>'biometricClockInOut')::boolean,false),COALESCE((p_body->>'passwordWaived')::boolean,false))
      ON CONFLICT(user_id) DO UPDATE SET
        biometric_login=COALESCE((p_body->>'biometricLogin')::boolean,app_auth.user_security_preferences.biometric_login),
        biometric_clock_in_out=COALESCE((p_body->>'biometricClockInOut')::boolean,app_auth.user_security_preferences.biometric_clock_in_out),
        password_waived=COALESCE((p_body->>'passwordWaived')::boolean,app_auth.user_security_preferences.password_waived),updated_at=now();
      IF p_body ? 'darkModeEnabled' THEN
        UPDATE app_auth.users SET dark_mode_enabled=(p_body->>'darkModeEnabled')::boolean,updated_at=now() WHERE user_id=v_user_id;
      END IF;
      v_result:=wfh_private.request('/me/security-preferences','GET','{}','{}')->'body';
      v_status:=CASE WHEN p_method='POST' THEN 201 ELSE 200 END;
    END IF;

  ELSIF p_path='/settings/company-working-hours' AND p_method='PUT' THEN
    IF NOT v_privileged THEN RETURN jsonb_build_object('status',403,'body',jsonb_build_object('error','Forbidden')); END IF;
    IF jsonb_typeof(p_body->'days') IS DISTINCT FROM 'array' OR jsonb_array_length(p_body->'days') NOT BETWEEN 1 AND 7 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='days must contain between one and seven schedules.';
    END IF;
    IF (SELECT count(DISTINCT value->>'day') FROM jsonb_array_elements(p_body->'days'))<>jsonb_array_length(p_body->'days') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Duplicate schedule day.';
    END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_body->'days') LOOP
      v_count:=array_position(ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],v_item->>'day');
      IF v_count IS NULL OR jsonb_typeof(v_item->'isWorkingDay') IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid schedule day or working-day flag.';
      END IF;
      INSERT INTO app.company_settings_working_hours(iso_day,day_name,is_working_day,start_time,end_time)
      VALUES(v_count,v_item->>'day',(v_item->>'isWorkingDay')::boolean,
        CASE WHEN (v_item->>'isWorkingDay')::boolean THEN (v_item->>'startTime')::time END,
        CASE WHEN (v_item->>'isWorkingDay')::boolean THEN (v_item->>'endTime')::time END)
      ON CONFLICT(iso_day) DO UPDATE SET is_working_day=EXCLUDED.is_working_day,start_time=EXCLUDED.start_time,
        end_time=EXCLUDED.end_time,updated_at=now();
    END LOOP;
    RETURN wfh_private.request(p_path,'GET','{}','{}');

  ELSIF p_path='/settings/leave-credit-types' AND p_method='PUT' THEN
    IF v_role<>'admin' THEN RETURN jsonb_build_object('status',403,'body',jsonb_build_object('error','Forbidden')); END IF;
    IF jsonb_typeof(p_body->'leaveTypes') IS DISTINCT FROM 'array' OR jsonb_array_length(p_body->'leaveTypes')=0 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='leaveTypes must be a non-empty array.';
    END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_body->'leaveTypes') LOOP
      IF (v_item->>'defaultLimitDays')::integer<0 OR NOT EXISTS(SELECT 1 FROM app.leave_types WHERE leave_type_id=v_item->>'leaveTypeId') THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid leave type or negative limit.';
      END IF;
      UPDATE app.leave_types SET default_limit_days=(v_item->>'defaultLimitDays')::integer WHERE leave_type_id=v_item->>'leaveTypeId';
    END LOOP;
    RETURN wfh_private.request(p_path,'GET','{}','{}');

  ELSIF p_path ~ '^/(me|hr)/(leave-requests|attendance-adjustments|adjustment-requests|overtime-requests)(/[^/]+(/(approve|deny|cancel|revoke))?)?$'
    AND p_method IN ('POST','PUT','DELETE') THEN
    v_is_leave:=p_path LIKE '%/leave-requests%';
    v_is_overtime:=p_path LIKE '%/overtime-requests%';
    v_request_id:=NULLIF(split_part(p_path,'/',4),'');
    v_transition:=NULLIF(split_part(p_path,'/',5),'');
    v_list_path:=CASE WHEN v_is_leave THEN '/me/leave-requests' WHEN v_is_overtime THEN '/me/overtime-requests' ELSE '/me/attendance-adjustments' END;
    IF v_employee_id IS NULL AND p_path LIKE '/me/%' THEN
      RETURN jsonb_build_object('status',404,'body',jsonb_build_object('error','No employee profile is linked to this account.'));
    END IF;
    IF v_request_id IS NOT NULL THEN
      IF v_is_leave THEN
        SELECT * INTO v_leave FROM app.leave_requests WHERE request_id=v_request_id
          AND (p_path LIKE '/hr/%' OR employee_id=v_employee_id) FOR UPDATE;
        IF v_leave.request_id IS NULL THEN RETURN jsonb_build_object('status',404,'body',jsonb_build_object('error','Request not found.')); END IF;
      ELSE
        SELECT * INTO v_adjustment FROM app.attendance_adjustment_requests WHERE request_id=v_request_id
          AND (p_path LIKE '/hr/%' OR employee_id=v_employee_id)
          AND (p_path LIKE '/hr/adjustment-requests/%' OR (source_page='home-overtime')=v_is_overtime) FOR UPDATE;
        IF v_adjustment.request_id IS NULL THEN RETURN jsonb_build_object('status',404,'body',jsonb_build_object('error','Request not found.')); END IF;
      END IF;
    END IF;
    IF v_transition IS NOT NULL THEN
      v_action:=COALESCE(v_leave.status::text,v_adjustment.status::text);
      IF v_transition IN ('approve','deny') AND (NOT v_privileged OR p_path NOT LIKE '/hr/%' OR v_action<>'pending') THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Only HR/Admin can approve or deny a pending request.';
      END IF;
      IF v_transition='revoke' AND v_action<>'approved' THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Only approved requests can be revoked.';
      END IF;
      IF v_transition='cancel' AND v_action IN ('cancelled','denied') THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='This request cannot be cancelled.';
      END IF;
      IF v_transition='deny' AND length(btrim(COALESCE(p_body->>'reason',p_body->>'deniedReason','')))<3 THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='A denial reason is required.';
      END IF;
      IF v_is_leave AND (v_transition='approve' OR (v_action='approved' AND v_transition IN ('cancel','revoke'))) THEN
        v_count:=wfh_private.leave_days(v_leave.start_date,v_leave.end_date);
        INSERT INTO app.leave_balances(employee_id,leave_type_id,credits,accrued,limit_days)
        SELECT v_leave.employee_id,leave_type_id,default_limit_days,default_limit_days,default_limit_days
          FROM app.leave_types WHERE leave_type_id=v_leave.leave_type_id ON CONFLICT DO NOTHING;
        UPDATE app.leave_balances SET credits=credits+CASE WHEN v_transition='approve' THEN -v_count ELSE v_count END
          WHERE employee_id=v_leave.employee_id AND leave_type_id=v_leave.leave_type_id
            AND (v_transition<>'approve' OR credits>=v_count);
        GET DIAGNOSTICS v_count=ROW_COUNT;
        IF v_count=0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Insufficient leave credits.'; END IF;
      END IF;
      v_action:=CASE v_transition WHEN 'approve' THEN 'approved' WHEN 'deny' THEN 'denied' WHEN 'revoke' THEN 'pending' ELSE 'cancelled' END;
      IF v_is_leave THEN
        UPDATE app.leave_requests SET status=v_action::app.request_status WHERE request_id=v_request_id;
        INSERT INTO app.leave_request_logs(request_id,status,logged_at,approved_by,reason)
          VALUES(v_request_id,v_action::app.request_status,now(),CASE WHEN p_path LIKE '/hr/%' THEN v_role END,
            COALESCE(p_body->>'reason',p_body->>'deniedReason',v_transition));
      ELSE
        UPDATE app.attendance_adjustment_requests SET status=v_action::app.request_status,
          approved_by=CASE WHEN v_transition='approve' THEN v_role END,approved_at=CASE WHEN v_transition='approve' THEN now() END,
          denied_reason=CASE WHEN v_transition='deny' THEN COALESCE(p_body->>'reason',p_body->>'deniedReason') END
          WHERE request_id=v_request_id;
        INSERT INTO app.adjustment_request_logs(request_id,status,logged_at,approved_by,reason)
          VALUES(v_request_id,v_action::app.request_status,now(),CASE WHEN p_path LIKE '/hr/%' THEN v_role END,
            COALESCE(p_body->>'reason',p_body->>'deniedReason',v_transition));
      END IF;
    ELSIF p_method='DELETE' THEN
      IF v_request_id IS NULL OR COALESCE(v_leave.status::text,v_adjustment.status::text)='approved' THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Revoke approved requests before deleting them.';
      END IF;
      IF v_is_leave THEN DELETE FROM app.leave_requests WHERE request_id=v_request_id;
      ELSE DELETE FROM app.attendance_adjustment_requests WHERE request_id=v_request_id; END IF;
      RETURN jsonb_build_object('status',200,'body',jsonb_build_object('deleted',true,'requestId',v_request_id));
    ELSE
      IF p_path LIKE '/hr/%' OR (p_method='PUT' AND v_request_id IS NULL) OR
        COALESCE(v_leave.status::text,v_adjustment.status::text,'pending')='approved' THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Approved requests must be revoked before editing.';
      END IF;
      IF p_body ? 'attachments' AND (jsonb_typeof(p_body->'attachments')<>'array' OR jsonb_array_length(p_body->'attachments')>10) THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Up to ten attachment filenames are allowed.';
      END IF;
      IF v_is_leave THEN
        SELECT * INTO v_leave_type FROM app.leave_types WHERE leave_type_id=p_body->>'leaveTypeId';
        v_from:=(p_body->>'startDate')::date; v_to:=(p_body->>'endDate')::date;
        IF v_leave_type.leave_type_id IS NULL OR v_from IS NULL OR v_to IS NULL OR v_from>v_to OR v_to-v_from>366
          OR length(btrim(COALESCE(p_body->>'message',''))) NOT BETWEEN 3 AND 5000
          OR COALESCE(p_body->>'sourcePage','calendar') NOT IN ('home','calendar','dashboard') THEN
          RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid leave type, date range, message, or source page.';
        END IF;
        v_count:=wfh_private.leave_days(v_from,v_to);
        SELECT COALESCE((SELECT credits FROM app.leave_balances WHERE employee_id=v_employee_id
          AND leave_type_id=v_leave_type.leave_type_id),v_leave_type.default_limit_days) INTO v_credits;
        IF v_count<=0 OR v_count>v_credits THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Insufficient leave credits or no working days selected.'; END IF;
        v_request_id:=COALESCE(v_request_id,'LR-'||gen_random_uuid()::text);
        INSERT INTO app.leave_requests(request_id,employee_id,leave_type_id,leave_type_name,start_date,end_date,message,status,submitted_at,source_page)
        VALUES(v_request_id,v_employee_id,v_leave_type.leave_type_id,v_leave_type.name,v_from,v_to,p_body->>'message','pending',now(),COALESCE(p_body->>'sourcePage','calendar'))
        ON CONFLICT(request_id) DO UPDATE SET leave_type_id=EXCLUDED.leave_type_id,leave_type_name=EXCLUDED.leave_type_name,
          start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,message=EXCLUDED.message,status='pending';
        DELETE FROM app.leave_request_attachments WHERE request_id=v_request_id;
        FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_body->'attachments','[]')) LOOP
          IF jsonb_typeof(v_item)<>'string' OR length(v_item#>>'{}') NOT BETWEEN 1 AND 260 THEN
            RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid attachment filename.'; END IF;
          INSERT INTO app.leave_request_attachments(request_id,file_name) VALUES(v_request_id,v_item#>>'{}');
        END LOOP;
        INSERT INTO app.leave_request_logs(request_id,status,logged_at,reason) VALUES(v_request_id,'pending',now(),'Submitted by employee');
      ELSE
        v_from:=(p_body->>'date')::date;
        v_action:=CASE WHEN v_is_overtime THEN 'home-overtime' ELSE 'home' END;
        IF v_from IS NULL OR length(btrim(COALESCE(CASE WHEN v_is_overtime THEN p_body->>'purpose' ELSE p_body->>'message' END,''))) NOT BETWEEN 3 AND 5000
          OR COALESCE(CASE WHEN v_is_overtime THEN p_body->>'startTime' ELSE p_body->>'clockInTime' END,'') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          OR COALESCE(CASE WHEN v_is_overtime THEN p_body->>'endTime' ELSE p_body->>'clockOutTime' END,'') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
          RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid request date, time, or message.';
        END IF;
        v_start:=v_from+CASE WHEN v_is_overtime THEN (p_body->>'startTime')::time ELSE (p_body->>'clockInTime')::time END;
        v_end:=v_from+CASE WHEN v_is_overtime THEN (p_body->>'endTime')::time ELSE (p_body->>'clockOutTime')::time END;
        v_break_minutes:=CASE WHEN v_is_overtime THEN 0 ELSE (p_body->>'breakDuration')::integer END;
        v_minutes:=floor(extract(epoch FROM(v_end-v_start))/60)::integer-v_break_minutes;
        IF v_minutes IS NULL OR v_minutes<=0 OR v_break_minutes NOT BETWEEN 0 AND 360 THEN
          RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid work duration or break length.';
        END IF;
        IF NOT v_is_overtime AND ((p_body->>'shiftDateFrom')::date IS DISTINCT FROM v_from OR
          (p_body->>'shiftDateTo')::date IS DISTINCT FROM v_from OR p_body->>'reason' NOT IN ('Forgot to Clock-in/Clock-out','Missing logs')) THEN
          RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Adjustment dates must match and use a supported reason.';
        END IF;
        SELECT * INTO v_schedule FROM app.company_settings_working_hours WHERE iso_day=extract(isodow FROM v_from);
        IF v_is_overtime AND v_schedule.is_working_day AND v_start<v_from+v_schedule.end_time AND v_end>v_from+v_schedule.start_time THEN
          RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Overtime must be outside regular working hours.';
        END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended(v_employee_id||':'||v_from::text||':'||v_action,0));
        IF v_request_id IS NULL THEN
          SELECT * INTO v_adjustment FROM app.attendance_adjustment_requests WHERE employee_id=v_employee_id
            AND request_date=v_from AND source_page=v_action AND status<>'cancelled' ORDER BY submitted_at DESC LIMIT 1 FOR UPDATE;
          IF v_adjustment.status='approved' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Revoke the approved request before resubmitting.'; END IF;
          v_request_id:=COALESCE(v_adjustment.request_id,'AR-'||gen_random_uuid()::text);
        END IF;
        SELECT * INTO v_employee FROM app.employees WHERE employee_id=v_employee_id;
        INSERT INTO app.attendance_adjustment_requests(request_id,employee_id,employee_name,position,department,request_date,
          shift_date_from,shift_date_to,clock_in_time,clock_out_time,reason,break_duration_minutes,total_work_duration_minutes,
          message,status,submitted_at,source_page)
        VALUES(v_request_id,v_employee_id,concat_ws(' ',v_employee.first_name,v_employee.last_name),v_employee.position,
          (SELECT name FROM app.departments WHERE department_id=v_employee.department_id),v_from,v_from,v_from,
          to_char(v_start,'HH24:MI'),to_char(v_end,'HH24:MI'),CASE WHEN v_is_overtime THEN 'Missing logs'::app.adjustment_reason ELSE (p_body->>'reason')::app.adjustment_reason END,
          v_break_minutes,v_minutes,CASE WHEN v_is_overtime THEN 'Purpose: '||(p_body->>'purpose') ELSE p_body->>'message' END,'pending',now(),v_action)
        ON CONFLICT(request_id) DO UPDATE SET clock_in_time=EXCLUDED.clock_in_time,clock_out_time=EXCLUDED.clock_out_time,
          request_date=EXCLUDED.request_date,shift_date_from=EXCLUDED.shift_date_from,shift_date_to=EXCLUDED.shift_date_to,
          reason=EXCLUDED.reason,break_duration_minutes=EXCLUDED.break_duration_minutes,total_work_duration_minutes=EXCLUDED.total_work_duration_minutes,
          message=EXCLUDED.message,status='pending',approved_by=NULL,approved_at=NULL,denied_reason=NULL;
        DELETE FROM app.adjustment_request_attachments WHERE request_id=v_request_id;
        FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_body->'attachments','[]')) LOOP
          IF jsonb_typeof(v_item)<>'string' OR length(v_item#>>'{}') NOT BETWEEN 1 AND 260 THEN
            RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid attachment filename.'; END IF;
          INSERT INTO app.adjustment_request_attachments(request_id,file_name) VALUES(v_request_id,v_item#>>'{}');
        END LOOP;
        INSERT INTO app.adjustment_request_logs(request_id,status,logged_at,reason) VALUES(v_request_id,'pending',now(),'Submitted by employee');
      END IF;
      v_status:=CASE WHEN p_method='POST' THEN 201 ELSE 200 END;
    END IF;
    IF p_path LIKE '/hr/%' THEN v_list_path:=CASE WHEN v_is_leave THEN '/hr/leave-requests' ELSE '/hr/adjustment-requests' END; END IF;
    SELECT value INTO v_extra FROM jsonb_array_elements(wfh_private.request(v_list_path,'GET','{}','{}')->'body'->'requests')
      WHERE COALESCE(value->>'requestId',value->>'request_id')=v_request_id LIMIT 1;
    v_result:=jsonb_build_object('request',v_extra,'cancelled',v_transition='cancel','revoked',v_transition='revoke');

  ELSIF p_path='/me/analytics' AND p_method='GET' THEN
    IF COALESCE(p_query->>'period','thisMonth') NOT IN ('thisMonth','lastMonth','last6Months','thisYear') THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid analytics period.';
    END IF;
    v_action:=COALESCE(p_query->>'period','thisMonth');
    v_from:=CASE v_action WHEN 'thisMonth' THEN date_trunc('month',v_today)::date
      WHEN 'lastMonth' THEN (date_trunc('month',v_today)-interval '1 month')::date
      WHEN 'last6Months' THEN (date_trunc('month',v_today)-interval '5 months')::date ELSE date_trunc('year',v_today)::date END;
    v_to:=CASE WHEN v_action='lastMonth' THEN (date_trunc('month',v_today)-interval '1 day')::date ELSE v_today END;
    WITH records AS(SELECT ar.*,date_trunc(CASE WHEN v_action IN ('thisMonth','lastMonth') THEN 'week' ELSE 'month' END,ar.attendance_date)::date AS bucket
      FROM wfh_private.effective_attendance(v_employee_id,v_from,v_to) ar
      WHERE EXISTS(SELECT 1 FROM app.company_settings_working_hours h WHERE h.iso_day=extract(isodow FROM ar.attendance_date) AND h.is_working_day)),
    buckets AS(SELECT bucket,count(*) FILTER(WHERE status='present') AS present,count(*) FILTER(WHERE status='late') AS late,
      count(*) FILTER(WHERE status='absent') AS absent,count(*) FILTER(WHERE status='on-leave') AS on_leave,count(*) FILTER(WHERE status='holiday') AS holiday
      FROM records GROUP BY bucket), labelled AS(SELECT *,row_number() OVER(ORDER BY bucket) AS ordinal FROM buckets)
    SELECT COALESCE(jsonb_agg(jsonb_build_object('label',CASE WHEN v_action IN ('thisMonth','lastMonth') THEN 'Week '||ordinal ELSE to_char(bucket,'Mon') END,
      'bucketStart',bucket,'present',present,'late',late,'absent',absent,'onLeave',on_leave,'holiday',holiday) ORDER BY bucket),'[]') INTO v_rows FROM labelled;
    SELECT jsonb_build_object('present',COALESCE(sum((value->>'present')::integer),0),'late',COALESCE(sum((value->>'late')::integer),0),
      'absent',COALESCE(sum((value->>'absent')::integer),0),'onLeave',COALESCE(sum((value->>'onLeave')::integer),0),
      'holiday',COALESCE(sum((value->>'holiday')::integer),0)) INTO v_extra FROM jsonb_array_elements(v_rows);
    v_count:=(v_extra->>'present')::integer+(v_extra->>'late')::integer+(v_extra->>'absent')::integer;
    v_extra:=v_extra||jsonb_build_object('totalDays',v_count+(v_extra->>'onLeave')::integer+(v_extra->>'holiday')::integer,
      'attendanceRate',CASE WHEN v_count>0 THEN round(((v_extra->>'present')::numeric+(v_extra->>'late')::numeric)*100/v_count) ELSE 0 END);
    v_result:=jsonb_build_object('period',v_action,'from',v_from,'to',v_to,'trends',v_rows,'summary',v_extra);

  ELSIF p_path ~ '^/employees/[^/]+/payroll-report$' AND p_method='GET' THEN
    SELECT employee_id INTO v_target_employee FROM app.employees WHERE employee_id=split_part(p_path,'/',3) OR employee_code=split_part(p_path,'/',3) LIMIT 1;
    v_result:=wfh_private.payroll_report(v_target_employee,COALESCE(v_from,date_trunc('month',v_today)::date),COALESCE(v_to,v_today));
    IF v_result IS NULL THEN RETURN jsonb_build_object('status',404,'body',jsonb_build_object('error','Employee not found.')); END IF;

  ELSIF p_path='/employees' AND p_method='POST' THEN
    IF NOT v_privileged THEN RETURN jsonb_build_object('status',403,'body',jsonb_build_object('error','Forbidden')); END IF;
    IF length(btrim(COALESCE(p_body->>'firstName',''))) NOT BETWEEN 1 AND 120 OR
      length(btrim(COALESCE(p_body->>'lastName',''))) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='First and last name are required.';
    END IF;
    v_target_employee:='EMP-'||replace(gen_random_uuid()::text,'-','');
    INSERT INTO app.employees(employee_id,employee_code,first_name,last_name,email,phone,department_id,position_id,position,
      employment_type,employment_status,join_date,birthday,gender,nationality,marital_status,address,profile_picture_url)
    VALUES(v_target_employee,v_target_employee,p_body->>'firstName',p_body->>'lastName',p_body->>'email',p_body->>'phone',
      (p_body->>'departmentId')::bigint,(p_body->>'positionId')::bigint,p_body->>'position',
      COALESCE(p_body->>'employmentType','full-time')::app.employment_type,COALESCE(p_body->>'employmentStatus','active')::app.employment_status,
      (p_body->>'joinDate')::date,(p_body->>'birthday')::date,p_body->>'gender',p_body->>'nationality',p_body->>'maritalStatus',
      p_body->>'address',p_body->>'profilePictureUrl');
    INSERT INTO app.payroll_profiles(employee_id,salary) VALUES(v_target_employee,0);
    INSERT INTO app.leave_balances(employee_id,leave_type_id,credits,accrued,limit_days)
      SELECT v_target_employee,leave_type_id,default_limit_days,default_limit_days,default_limit_days FROM app.leave_types;
    SELECT jsonb_build_object('employee',to_jsonb(e)) INTO v_result FROM app.employees e WHERE employee_id=v_target_employee;
    v_status:=201;

  ELSIF p_path ~ '^/employees/[^/]+/(payroll|leave-credits)$' AND p_method IN ('GET','PUT') THEN
    SELECT employee_id INTO v_target_employee FROM app.employees WHERE employee_id=split_part(p_path,'/',3)
      OR employee_code=split_part(p_path,'/',3) LIMIT 1;
    IF v_target_employee IS NULL THEN RETURN jsonb_build_object('status',404,'body',jsonb_build_object('error','Employee not found.')); END IF;
    IF p_method='PUT' AND v_role<>'admin' THEN RETURN jsonb_build_object('status',403,'body',jsonb_build_object('error','Forbidden')); END IF;
    IF p_path LIKE '%/leave-credits' THEN
      IF p_method='PUT' THEN
        IF jsonb_typeof(p_body->'leaveCredits') IS DISTINCT FROM 'array' OR jsonb_array_length(p_body->'leaveCredits')=0 THEN
          RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='leaveCredits must be a non-empty array.';
        END IF;
        FOR v_item IN SELECT value FROM jsonb_array_elements(p_body->'leaveCredits') LOOP
          IF (v_item->>'credits')::integer IS NULL OR (v_item->>'credits')::integer<0 OR
            NOT EXISTS(SELECT 1 FROM app.leave_types WHERE leave_type_id=v_item->>'leaveTypeId') THEN
            RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid leave type or credits.';
          END IF;
          INSERT INTO app.leave_balances(employee_id,leave_type_id,credits,accrued,limit_days)
          VALUES(v_target_employee,v_item->>'leaveTypeId',(v_item->>'credits')::integer,(v_item->>'credits')::integer,(v_item->>'credits')::integer)
          ON CONFLICT(employee_id,leave_type_id) DO UPDATE SET credits=EXCLUDED.credits;
        END LOOP;
      END IF;
      SELECT jsonb_build_object('leaveCredits',COALESCE(jsonb_agg(jsonb_build_object('leaveTypeId',lt.leave_type_id,'name',lt.name,
        'credits',COALESCE(lb.credits,lt.default_limit_days),'accrued',COALESCE(lb.accrued,lt.default_limit_days),
        'limitDays',COALESCE(lb.limit_days,lt.default_limit_days),'defaultLimitDays',lt.default_limit_days) ORDER BY lt.name),'[]'))
      INTO v_result FROM app.leave_types lt LEFT JOIN app.leave_balances lb ON lb.leave_type_id=lt.leave_type_id AND lb.employee_id=v_target_employee;
    ELSE
      IF p_method='PUT' THEN
        IF (p_body->>'salary')::numeric IS NULL OR (p_body->>'salary')::numeric<0 OR
          jsonb_typeof(p_body->'governmentIds') IS DISTINCT FROM 'object' OR jsonb_typeof(p_body->'deductions') IS DISTINCT FROM 'array'
          OR jsonb_array_length(p_body->'deductions')>100 OR jsonb_typeof(COALESCE(p_body->'otherEarnings','[]'))<>'array'
          OR jsonb_array_length(COALESCE(p_body->'otherEarnings','[]'))>100 THEN
          RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid salary, government IDs, deductions, or earnings.';
        END IF;
        INSERT INTO app.payroll_profiles(employee_id,salary,pag_ibig,phil_health,sss,tin)
        VALUES(v_target_employee,(p_body->>'salary')::numeric,p_body->'governmentIds'->>'pagIbig',p_body->'governmentIds'->>'philHealth',
          p_body->'governmentIds'->>'sss',p_body->'governmentIds'->>'tin') ON CONFLICT(employee_id) DO UPDATE SET
          salary=EXCLUDED.salary,pag_ibig=EXCLUDED.pag_ibig,phil_health=EXCLUDED.phil_health,sss=EXCLUDED.sss,tin=EXCLUDED.tin,updated_at=now();
        DELETE FROM app.payroll_deductions WHERE employee_id=v_target_employee;
        DELETE FROM app.payroll_other_earnings WHERE employee_id=v_target_employee;
        FOR v_item IN SELECT value FROM jsonb_array_elements(p_body->'deductions') LOOP
          IF length(btrim(COALESCE(v_item->>'name','')))=0 OR (v_item->>'amount')::numeric IS NULL OR (v_item->>'amount')::numeric<0 THEN
            RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid deduction.'; END IF;
          INSERT INTO app.payroll_deductions(deduction_id,employee_id,deduction_name,amount)
            VALUES(COALESCE(NULLIF(v_item->>'id',''),'DED-'||gen_random_uuid()::text),v_target_employee,v_item->>'name',(v_item->>'amount')::numeric);
        END LOOP;
        FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_body->'otherEarnings','[]')) LOOP
          IF length(btrim(COALESCE(v_item->>'name','')))=0 OR (v_item->>'amount')::numeric IS NULL OR (v_item->>'amount')::numeric<0 THEN
            RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid earning.'; END IF;
          INSERT INTO app.payroll_other_earnings(earning_id,employee_id,earning_name,amount)
            VALUES(COALESCE(NULLIF(v_item->>'id',''),'EARN-'||gen_random_uuid()::text),v_target_employee,v_item->>'name',(v_item->>'amount')::numeric);
        END LOOP;
      END IF;
      SELECT value INTO v_extra FROM jsonb_array_elements(wfh_private.request('/employees','GET','{}','{}')->'body'->'employees')
        WHERE value->>'employee_id'=v_target_employee;
      v_result:=jsonb_build_object('employee',v_extra);
    END IF;

  ELSIF p_path ~ '^/settings/company-working-hours(/[0-9]+)?$' AND p_method IN ('POST','PUT','DELETE') THEN
    IF NOT v_privileged THEN RETURN jsonb_build_object('status',403,'body',jsonb_build_object('error','Forbidden')); END IF;
    IF NULLIF(split_part(p_path,'/',4),'') IS NOT NULL THEN
      SELECT * INTO v_schedule FROM app.company_settings_working_hours WHERE working_hour_id=split_part(p_path,'/',4)::bigint FOR UPDATE;
      IF v_schedule.working_hour_id IS NULL THEN RETURN jsonb_build_object('status',404,'body',jsonb_build_object('error','Schedule not found.')); END IF;
    END IF;
    IF p_method='DELETE' THEN
      DELETE FROM app.company_settings_working_hours WHERE working_hour_id=v_schedule.working_hour_id;
      v_result:=jsonb_build_object('deleted',true);
    ELSE
      v_item:=jsonb_build_object('day',v_schedule.day_name,'isWorkingDay',COALESCE(v_schedule.is_working_day,true),
        'startTime',v_schedule.start_time,'endTime',v_schedule.end_time)||p_body;
      v_count:=array_position(ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],v_item->>'day');
      IF v_count IS NULL OR jsonb_typeof(v_item->'isWorkingDay')<>'boolean' THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid schedule day or working-day flag.'; END IF;
      IF p_method='POST' THEN
        INSERT INTO app.company_settings_working_hours(iso_day,day_name,is_working_day,start_time,end_time)
        VALUES(v_count,v_item->>'day',(v_item->>'isWorkingDay')::boolean,
          CASE WHEN (v_item->>'isWorkingDay')::boolean THEN (v_item->>'startTime')::time END,
          CASE WHEN (v_item->>'isWorkingDay')::boolean THEN (v_item->>'endTime')::time END) RETURNING * INTO v_schedule;
        v_status:=201;
      ELSE
        UPDATE app.company_settings_working_hours SET iso_day=v_count,day_name=v_item->>'day',is_working_day=(v_item->>'isWorkingDay')::boolean,
          start_time=CASE WHEN (v_item->>'isWorkingDay')::boolean THEN (v_item->>'startTime')::time END,
          end_time=CASE WHEN (v_item->>'isWorkingDay')::boolean THEN (v_item->>'endTime')::time END,updated_at=now()
          WHERE working_hour_id=v_schedule.working_hour_id RETURNING * INTO v_schedule;
      END IF;
      v_result:=jsonb_build_object('workingHour',to_jsonb(v_schedule)||jsonb_build_object('day',v_schedule.day_name));
    END IF;

  ELSIF p_path ~ '^/settings/holidays(/[^/]+)?$' AND p_method IN ('POST','PUT','DELETE') THEN
    IF v_role<>'admin' THEN RETURN jsonb_build_object('status',403,'body',jsonb_build_object('error','Forbidden')); END IF;
    v_request_id:=NULLIF(split_part(p_path,'/',4),'');
    IF p_method='DELETE' THEN
      DELETE FROM app.holidays WHERE holiday_id=v_request_id;
      GET DIAGNOSTICS v_count=ROW_COUNT;
      IF v_count=0 THEN DELETE FROM app.holiday_subdivision_holidays WHERE subdivision_holiday_id=v_request_id; GET DIAGNOSTICS v_count=ROW_COUNT; END IF;
      v_result:=jsonb_build_object('deleted',v_count>0);
    ELSE
      v_rows:=CASE WHEN v_request_id='bulk' THEN p_body->'holidays' ELSE jsonb_build_array(p_body) END;
      IF jsonb_typeof(v_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(v_rows) NOT BETWEEN 1 AND 1000 THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Expected one or more holidays.'; END IF;
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
        IF length(btrim(COALESCE(v_item->>'name','')))=0 OR (v_item->>'date')::date IS NULL OR
          COALESCE(v_item->>'countryCode','PH') !~ '^[A-Z]{2}$' OR COALESCE(v_item->>'type','public') NOT IN ('public','personal') THEN
          RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid holiday name, date, country, or type.'; END IF;
        v_from:=(v_item->>'date')::date;
        v_action:=COALESCE(v_item->>'countryCode','PH');
        IF COALESCE(v_item->>'scope','national')='subdivision' THEN
          IF length(btrim(COALESCE(v_item->>'subdivisionCode','')))=0 THEN
            RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Subdivision code is required.'; END IF;
          IF p_method='PUT' THEN
            UPDATE app.holiday_subdivision_holidays SET name=v_item->>'name',holiday_date=v_from,country_code=v_action,
              country_name=COALESCE(v_item->>'countryName',v_action),holiday_type=COALESCE(v_item->>'type','public')::app.holiday_type,
              subdivision_code=v_item->>'subdivisionCode',subdivision_name=COALESCE(v_item->>'subdivisionName',v_item->>'subdivisionCode'),updated_at=now()
              WHERE subdivision_holiday_id=v_request_id;
            GET DIAGNOSTICS v_count=ROW_COUNT;
            IF v_count=0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Subdivision holiday not found.'; END IF;
          ELSE
            INSERT INTO app.holiday_subdivision_holidays(subdivision_holiday_id,name,holiday_date,country_code,country_name,holiday_type,subdivision_code,subdivision_name)
            VALUES('SH-'||gen_random_uuid()::text,v_item->>'name',v_from,v_action,COALESCE(v_item->>'countryName',v_action),
              COALESCE(v_item->>'type','public')::app.holiday_type,v_item->>'subdivisionCode',COALESCE(v_item->>'subdivisionName',v_item->>'subdivisionCode'))
            ON CONFLICT(country_code,subdivision_code,holiday_date,name) DO UPDATE SET holiday_type=EXCLUDED.holiday_type;
          END IF;
        ELSE
          IF p_method='PUT' THEN
            UPDATE app.holidays SET name=v_item->>'name',holiday_date=v_from,country_code=v_action,
              country_name=COALESCE(v_item->>'countryName',CASE v_action WHEN 'PH' THEN 'Philippines' WHEN 'AU' THEN 'Australia' WHEN 'US' THEN 'United States' ELSE v_action END),
              holiday_type=COALESCE(v_item->>'type','public')::app.holiday_type WHERE holiday_id=v_request_id;
            GET DIAGNOSTICS v_count=ROW_COUNT;
            IF v_count=0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Holiday not found.'; END IF;
          ELSE
            INSERT INTO app.holidays(holiday_id,name,holiday_date,country_code,country_name,holiday_type)
            VALUES('H-'||gen_random_uuid()::text,v_item->>'name',v_from,v_action,
              COALESCE(v_item->>'countryName',CASE v_action WHEN 'PH' THEN 'Philippines' WHEN 'AU' THEN 'Australia' WHEN 'US' THEN 'United States' ELSE v_action END),
              COALESCE(v_item->>'type','public')::app.holiday_type)
            ON CONFLICT(country_code,holiday_date) DO UPDATE SET name=EXCLUDED.name,holiday_type=EXCLUDED.holiday_type;
          END IF;
        END IF;
      END LOOP;
      RETURN wfh_private.request('/settings/holidays','GET','{}','{}');
    END IF;

  ELSIF p_path='/me/slack-notification-logs' AND p_method='GET' THEN
    SELECT jsonb_build_object('logs',COALESCE(jsonb_agg(to_jsonb(log)||jsonb_build_object('notificationLogId',log.notification_log_id,
      'deliveryStatus',log.delivery_status,'createdAt',log.created_at,'eventAction',log.event_action) ORDER BY log.created_at DESC),'[]'))
      INTO v_result FROM(SELECT * FROM app.slack_notification_logs WHERE employee_id=v_employee_id ORDER BY created_at DESC LIMIT 100) log;

  ELSIF p_path='/me/security-preferences/password' AND p_method='POST' THEN
    IF p_body ? 'newPassword' OR COALESCE((p_body->>'passwordUpdated')::boolean,false)=false THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Change the password through Supabase Auth before recording this activity.';
    END IF;
    INSERT INTO app_auth.user_security_preferences(user_id,password_waived)
    VALUES(v_user_id,COALESCE((p_body->>'waivePassword')::boolean,false)) ON CONFLICT(user_id) DO UPDATE
      SET password_waived=EXCLUDED.password_waived,updated_at=now();
    INSERT INTO app_auth.password_activities(user_id,action,platform,status,is_waived)
    VALUES(v_user_id,CASE WHEN COALESCE((p_body->>'waivePassword')::boolean,false) THEN 'Waive Password' ELSE 'Update Password' END,
      left(COALESCE(p_body->>'platform','web'),120),'Successful',COALESCE((p_body->>'waivePassword')::boolean,false))
    RETURNING jsonb_build_object('activityId',activity_id,'action',action,'activityAt',activity_at,'platform',platform,
      'status',status,'isWaived',is_waived) INTO v_extra;
    v_result:=jsonb_build_object('ok',true,'activity',v_extra);

  ELSIF p_path='/me/leave-planner/insights' AND p_method='POST' THEN
    RETURN wfh_private.gemini_leave_insights(p_body->'plans');

  ELSIF p_path = '/me/profile' AND p_method = 'GET' THEN
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
      SELECT wfh_private.attendance_json(jsonb_populate_record(NULL::app.attendance_records,to_jsonb(ar)||jsonb_build_object('record_type','actual'))) AS items,
        ar.attendance_date FROM wfh_private.effective_attendance(v_employee_id,v_from,v_to) ar
      ORDER BY ar.attendance_date DESC LIMIT 400
    ) attendance;
    SELECT COALESCE(jsonb_agg(items ORDER BY items->>'holiday_date'), '[]'::jsonb) INTO v_extra FROM(
      SELECT to_jsonb(h) AS items FROM app.holidays h WHERE (v_from IS NULL OR h.holiday_date>=v_from) AND (v_to IS NULL OR h.holiday_date<=v_to)
      UNION ALL SELECT to_jsonb(h)||jsonb_build_object('holiday_id',h.subdivision_holiday_id) FROM app.holiday_subdivision_holidays h
        WHERE (v_from IS NULL OR h.holiday_date>=v_from) AND (v_to IS NULL OR h.holiday_date<=v_to)) holidays;
    v_result := jsonb_build_object('attendance', v_rows, 'holidays', v_extra);

  ELSIF p_path IN ('/employees', '/hr/employees') AND p_method = 'GET' THEN
    SELECT jsonb_build_object('employees', COALESCE(jsonb_agg(items), '[]'::jsonb)) INTO v_result FROM (
      SELECT to_jsonb(e) || jsonb_build_object('department', d.name, 'position', COALESCE(jp.name, e.position),
        'attendance_status', COALESCE(ar.status::text, 'absent'), 'clock_in_time', to_char(ar.clock_in, 'HH24:MI'),
        'clock_out_time', to_char(ar.clock_out, 'HH24:MI'), 'work_duration_minutes', ar.work_duration_minutes,
        'late_minutes', ar.late_minutes,'status_date',ar.attendance_date,'active_break_started_at',ar.active_break_started_at,
        'salary',pp.salary,'sss',pp.sss,'tin',pp.tin,'phil_health',pp.phil_health,'pag_ibig',pp.pag_ibig,
        'payroll_deductions',(SELECT COALESCE(jsonb_agg(to_jsonb(pd)),'[]') FROM app.payroll_deductions pd WHERE pd.employee_id=e.employee_id),
        'payroll_other_earnings',(SELECT COALESCE(jsonb_agg(to_jsonb(pe)),'[]') FROM app.payroll_other_earnings pe WHERE pe.employee_id=e.employee_id)) AS items
      FROM app.employees e LEFT JOIN app.departments d ON d.department_id = e.department_id
      LEFT JOIN app.job_positions jp ON jp.position_id = e.position_id
      LEFT JOIN app.payroll_profiles pp ON pp.employee_id=e.employee_id
      LEFT JOIN LATERAL(SELECT * FROM wfh_private.effective_attendance(e.employee_id,COALESCE(v_from,v_today),COALESCE(v_to,v_today))
        ORDER BY attendance_date DESC LIMIT 1) ar ON true
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
    SELECT jsonb_build_object('holidays',COALESCE(jsonb_agg(items||jsonb_build_object('id',items->>'holiday_id','date',items->>'holiday_date',
      'type',items->>'holiday_type','countryCode',items->>'country_code','countryName',items->>'country_name',
      'subdivisionCode',items->>'subdivision_code','subdivisionName',items->>'subdivision_name',
      'scope',CASE WHEN items ? 'subdivision_code' THEN 'subdivision' ELSE 'national' END) ORDER BY items->>'holiday_date'),'[]'))
    INTO v_result FROM(SELECT to_jsonb(h) AS items FROM app.holidays h
      WHERE (v_from IS NULL OR h.holiday_date>=v_from) AND (v_to IS NULL OR h.holiday_date<=v_to)
      UNION ALL SELECT to_jsonb(h)||jsonb_build_object('holiday_id',h.subdivision_holiday_id) FROM app.holiday_subdivision_holidays h
      WHERE (v_from IS NULL OR h.holiday_date>=v_from) AND (v_to IS NULL OR h.holiday_date<=v_to)) holidays;

  ELSE
    RETURN jsonb_build_object('status', 404, 'body', jsonb_build_object('error', 'Unknown application route or HTTP method.', 'path', p_path, 'method', p_method));
  END IF;
  RETURN jsonb_build_object('status', v_status, 'body', COALESCE(v_result, '{}'::jsonb));
EXCEPTION
  WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
    RETURN jsonb_build_object('status', 400, 'body', jsonb_build_object('error', 'Invalid date, identifier, or input value.'));
  WHEN invalid_parameter_value OR check_violation OR not_null_violation OR foreign_key_violation THEN
    RETURN jsonb_build_object('status',400,'body',jsonb_build_object('error',SQLERRM));
  WHEN unique_violation THEN
    RETURN jsonb_build_object('status',409,'body',jsonb_build_object('error','A conflicting record already exists.'));
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