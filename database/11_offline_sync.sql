-- Apply after 07_supabase_rest_api.sql and 10_request_notifications.sql.
CREATE TABLE IF NOT EXISTS app.offline_sync_receipts (
  user_id uuid NOT NULL REFERENCES app_auth.users(user_id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  operation jsonb NOT NULL,
  response jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,operation_id)
);
ALTER TABLE app.offline_sync_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.offline_sync_receipts FROM anon,authenticated;

CREATE OR REPLACE FUNCTION wfh_private.sync_offline_attendance(
 p_user uuid,p_employee text,p_path text,p_event timestamptz,p_operation uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_day date:=(p_event AT TIME ZONE 'Asia/Manila')::date;
 v_local timestamp:=p_event AT TIME ZONE 'Asia/Manila';
 v_record app.attendance_records%ROWTYPE;
 v_break app.attendance_break_logs%ROWTYPE;
 v_schedule app.company_settings_working_hours%ROWTYPE;
 v_action text;
 v_minutes integer:=0;
 v_break_minutes integer:=0;
 v_start timestamp;
 v_end timestamp;
BEGIN
 IF p_employee IS NULL THEN
   RETURN jsonb_build_object('status',404,'body',jsonb_build_object('error','No employee profile is linked to this account.'));
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_employee||':'||v_day::text,0));
 SELECT * INTO v_record FROM app.attendance_records WHERE employee_id=p_employee
   AND attendance_date=v_day AND record_type='actual' FOR UPDATE;
 IF EXISTS(SELECT 1 FROM app.attendance_activity_logs l WHERE l.employee_id=p_employee
   AND (l.logged_at AT TIME ZONE 'Asia/Manila')::date=v_day AND l.logged_at>p_event) THEN
   RETURN jsonb_build_object('status',409,'body',jsonb_build_object('error','Newer attendance already exists. Review this saved action before syncing.'));
 END IF;
 SELECT * INTO v_schedule FROM app.company_settings_working_hours WHERE iso_day=extract(isodow FROM v_day);
 IF p_path='/me/attendance/clock-in' THEN
   IF v_record.clock_in IS NOT NULL AND v_record.clock_out IS NULL THEN
     RETURN jsonb_build_object('status',409,'body',jsonb_build_object('error','This date already has an active clock-in.'));
   END IF;
   v_minutes:=CASE WHEN v_record.clock_in IS NOT NULL THEN COALESCE(v_record.late_minutes,0) WHEN v_schedule.is_working_day AND v_local::time>=(v_schedule.start_time+interval '15 minutes')::time
     THEN GREATEST(0,floor(extract(epoch FROM (v_local::time-v_schedule.start_time))/60)::integer) ELSE 0 END;
   IF v_record.attendance_id IS NULL THEN
     INSERT INTO app.attendance_records(employee_id,attendance_date,record_type,status,clock_in,work_duration_minutes,late_minutes,total_break_duration_minutes)
     VALUES(p_employee,v_day,'actual',CASE WHEN v_minutes>=15 THEN 'late'::app.attendance_status ELSE 'present'::app.attendance_status END,
       v_local::time,0,v_minutes,0) RETURNING * INTO v_record;
   ELSE
     UPDATE app.attendance_records SET clock_in=v_local::time,clock_out=NULL,active_break_started_at=NULL,late_minutes=v_minutes,
       status=CASE WHEN v_minutes>=15 THEN 'late'::app.attendance_status ELSE 'present'::app.attendance_status END
       WHERE attendance_id=v_record.attendance_id RETURNING * INTO v_record;
   END IF;
   v_action:='clock_in';
 ELSE
   IF v_record.clock_in IS NULL OR v_record.clock_out IS NOT NULL OR v_local::time<v_record.clock_in THEN
     RETURN jsonb_build_object('status',409,'body',jsonb_build_object('error','No matching active shift was found for the recorded time. Review this saved action.'));
   END IF;
   SELECT * INTO v_break FROM app.attendance_break_logs WHERE attendance_id=v_record.attendance_id AND break_ended_at IS NULL FOR UPDATE;
   IF p_path='/me/attendance/break/start' THEN
     IF v_record.active_break_started_at IS NOT NULL OR v_break.break_id IS NOT NULL THEN
       RETURN jsonb_build_object('status',409,'body',jsonb_build_object('error','A break is already active.'));
     END IF;
     INSERT INTO app.attendance_break_logs(attendance_id,break_started_at) VALUES(v_record.attendance_id,p_event) RETURNING * INTO v_break;
     UPDATE app.attendance_records SET active_break_started_at=p_event WHERE attendance_id=v_record.attendance_id RETURNING * INTO v_record;
     v_action:='break_start';
   ELSIF p_path='/me/attendance/break/end' THEN
     IF v_break.break_id IS NULL OR p_event<v_break.break_started_at THEN
       RETURN jsonb_build_object('status',409,'body',jsonb_build_object('error','No matching active break was found.'));
     END IF;
     v_break_minutes:=GREATEST(0,floor(extract(epoch FROM (p_event-v_break.break_started_at))/60)::integer);
     UPDATE app.attendance_break_logs SET break_ended_at=p_event,break_duration_minutes=v_break_minutes WHERE break_id=v_break.break_id RETURNING * INTO v_break;
     UPDATE app.attendance_records SET active_break_started_at=NULL,
       total_break_duration_minutes=COALESCE(total_break_duration_minutes,0)+v_break_minutes
       WHERE attendance_id=v_record.attendance_id RETURNING * INTO v_record;
     v_action:='break_end';
   ELSE
     IF v_record.active_break_started_at IS NOT NULL OR v_break.break_id IS NOT NULL THEN
       RETURN jsonb_build_object('status',409,'body',jsonb_build_object('error','End the active break before clocking out.'));
     END IF;
     IF v_schedule.is_working_day THEN
       v_start:=GREATEST(v_day+v_record.clock_in,v_day+v_schedule.start_time);
       v_end:=LEAST(v_local,v_day+v_schedule.end_time);
       SELECT COALESCE(sum(GREATEST(0,floor(extract(epoch FROM (
         LEAST(bl.break_ended_at AT TIME ZONE 'Asia/Manila',v_end)-GREATEST(bl.break_started_at AT TIME ZONE 'Asia/Manila',v_start)
       ))/60))),0)::integer INTO v_break_minutes FROM app.attendance_break_logs bl WHERE bl.attendance_id=v_record.attendance_id;
       v_minutes:=GREATEST(0,floor(extract(epoch FROM (v_end-v_start))/60)::integer-v_break_minutes);
     END IF;
     UPDATE app.attendance_records SET clock_out=v_local::time,work_duration_minutes=COALESCE(work_duration_minutes,0)+v_minutes,
       status=CASE WHEN COALESCE(v_record.work_duration_minutes,0)+v_minutes<480 THEN 'absent'::app.attendance_status WHEN COALESCE(late_minutes,0)>=15 THEN 'late'::app.attendance_status ELSE 'present'::app.attendance_status END
       WHERE attendance_id=v_record.attendance_id RETURNING * INTO v_record;
     v_action:='clock_out';
   END IF;
 END IF;
 -- The existing Slack AFTER INSERT trigger runs only once for this committed operation.
 INSERT INTO app.attendance_activity_logs(attendance_id,employee_id,action,logged_at,metadata)
 VALUES(v_record.attendance_id,p_employee,v_action,p_event,jsonb_build_object('source','mobile-sync',
   'syncOperationId',p_operation,'capturedAt',p_event,'syncedAt',now(),'breakId',v_break.break_id));
 RETURN jsonb_build_object('status',200,'body',jsonb_build_object('attendance',wfh_private.attendance_json(v_record),
   'breakLog',jsonb_build_object('breakDurationMinutes',v_break_minutes)));
END;
$$;
REVOKE ALL ON FUNCTION wfh_private.sync_offline_attendance(uuid,text,text,timestamptz,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wfh_private.sync_offline_operation(p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_user uuid; v_employee text; v_role text; v_id uuid; v_event timestamptz;
 v_path text:=p_body->>'path'; v_method text:=upper(p_body->>'method');
 v_previous app.offline_sync_receipts%ROWTYPE; v_result jsonb; v_request text;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status',401,'body',jsonb_build_object('error','Sign in before syncing.')); END IF;
 SELECT u.user_id,COALESCE(u.employee_id,e.employee_id),COALESCE((SELECT r.role_name FROM app_auth.user_roles ur
   JOIN app_auth.roles r ON r.role_id=ur.role_id WHERE ur.user_id=u.user_id
   ORDER BY CASE r.role_name WHEN 'admin' THEN 1 WHEN 'hr_manager' THEN 2 ELSE 3 END LIMIT 1),'employee')
 INTO v_user,v_employee,v_role FROM auth.users a JOIN app_auth.users u ON u.supabase_auth_user_id=a.id OR
   (u.supabase_auth_user_id IS NULL AND lower(u.email::text)=lower(a.email) AND a.email_confirmed_at IS NOT NULL)
 LEFT JOIN app.employees e ON lower(e.email::text)=lower(a.email)
 WHERE a.id=auth.uid() AND u.is_active ORDER BY (u.supabase_auth_user_id=a.id) DESC NULLS LAST LIMIT 1;
 IF v_user IS NULL THEN RETURN jsonb_build_object('status',403,'body',jsonb_build_object('error','No active account is linked to this session.')); END IF;
 IF jsonb_typeof(p_body) IS DISTINCT FROM 'object' OR jsonb_typeof(p_body->'body') IS DISTINCT FROM 'object'
   OR COALESCE(p_body->>'operationId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR COALESCE(p_body->>'occurredAt','')='' THEN
   RETURN jsonb_build_object('status',400,'body',jsonb_build_object('error','Invalid saved operation.'));
 END IF;
 IF NOT (
   (v_method='POST' AND v_path IN ('/me/attendance/clock-in','/me/attendance/clock-out','/me/attendance/break/start','/me/attendance/break/end'))
   OR (v_method='POST' AND v_path ~ '^/me/(leave-requests|attendance-adjustments|overtime-requests)$')
   OR (v_method IN ('PUT','DELETE') AND v_path ~ '^/me/(leave-requests|attendance-adjustments|overtime-requests)/[^/]+$')
   OR (v_method='POST' AND v_path ~ '^/me/(leave-requests|attendance-adjustments|overtime-requests)/[^/]+/(cancel|revoke)$')
 ) THEN RETURN jsonb_build_object('status',400,'body',jsonb_build_object('error','This action cannot be synced from an offline queue.')); END IF;
 v_id:=(p_body->>'operationId')::uuid; v_event:=(p_body->>'occurredAt')::timestamptz;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text||':'||v_id::text,0));
 SELECT * INTO v_previous FROM app.offline_sync_receipts WHERE user_id=v_user AND operation_id=v_id;
 IF FOUND THEN
   IF v_previous.operation<>p_body THEN RETURN jsonb_build_object('status',409,'body',jsonb_build_object('error','This operation ID was already used for a different action.')); END IF;
   RETURN v_previous.response;
 END IF;
 IF v_event>now()+interval '5 minutes' THEN
   RETURN jsonb_build_object('status',409,'body',jsonb_build_object('error','The recorded time is ahead of the server clock. Review this saved action.'));
 END IF;
 PERFORM set_config('app.user_id',v_user::text,true); PERFORM set_config('app.user_role',v_role,true);
 IF v_path LIKE '/me/attendance/%' THEN
   v_result:=wfh_private.sync_offline_attendance(v_user,v_employee,v_path,v_event,v_id);
 ELSE
   v_result:=wfh_private.request(v_path,v_method,'{}',p_body->'body');
   IF (v_result->>'status')::integer BETWEEN 200 AND 299 AND v_method='POST'
     AND v_path ~ '^/me/(leave-requests|attendance-adjustments|overtime-requests)$' THEN
     v_request:=COALESCE(v_result#>>'{body,request,requestId}',v_result#>>'{body,request,request_id}');
     IF v_path='/me/leave-requests' THEN
       UPDATE app.leave_requests SET submitted_at=v_event WHERE request_id=v_request AND requestor_user_id=v_user AND submitted_at>=now();
     ELSE
       UPDATE app.attendance_adjustment_requests SET submitted_at=v_event WHERE request_id=v_request AND requestor_user_id=v_user AND submitted_at>=now();
     END IF;
   END IF;
 END IF;
 IF (v_result->>'status')::integer BETWEEN 200 AND 299 THEN
   INSERT INTO app.offline_sync_receipts(user_id,operation_id,operation,response,occurred_at) VALUES(v_user,v_id,p_body,v_result,v_event);
 END IF;
 RETURN v_result;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
 RETURN jsonb_build_object('status',400,'body',jsonb_build_object('error','The saved operation contains an invalid timestamp or identifier.'));
END;
$$;
REVOKE ALL ON FUNCTION wfh_private.sync_offline_operation(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION wfh_private.sync_offline_operation(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION api.wfh_pulse_request(
 p_path text,p_method text DEFAULT 'GET',p_query jsonb DEFAULT '{}'::jsonb,p_body jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE
   WHEN p_path='/me/offline-sync/capabilities' AND upper(p_method)='GET'
     THEN jsonb_build_object('status',200,'body',jsonb_build_object('offlineSync',true,'version',1))
   WHEN p_path='/me/offline-sync' AND upper(p_method)='POST' THEN wfh_private.sync_offline_operation(p_body)
   WHEN p_path='/me/push-devices' THEN wfh_private.push_device_for_auth(p_method,p_body)
   ELSE wfh_private.request(p_path,p_method,p_query,p_body) END;
$$;
REVOKE ALL ON FUNCTION api.wfh_pulse_request(text,text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION api.wfh_pulse_request(text,text,jsonb,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
