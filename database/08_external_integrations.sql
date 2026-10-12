BEGIN;

CREATE OR REPLACE FUNCTION wfh_private.queue_slack_attendance_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_webhook text;
  v_employee record;
  v_attendance record;
  v_label text;
  v_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NEW.action NOT IN ('clock_in','clock_out') THEN
    RETURN NEW;
  END IF;
  SELECT decrypted_secret INTO v_webhook FROM vault.decrypted_secrets
    WHERE name='slack_attendance_webhook' LIMIT 1;
  IF COALESCE(v_webhook,'')='' THEN
    RETURN NEW;
  END IF;
  SELECT e.employee_id,e.first_name,e.last_name,COALESCE(jp.name,e.position,'Employee') AS position,
    ar.attendance_date,ar.status,
    CASE WHEN NEW.action='clock_in' THEN ar.clock_in ELSE ar.clock_out END AS event_time
  INTO v_employee
  FROM app.employees e
  LEFT JOIN app.job_positions jp ON jp.position_id=e.position_id
  JOIN app.attendance_records ar ON ar.attendance_id=NEW.attendance_id
  WHERE e.employee_id=NEW.employee_id;
  IF v_employee.employee_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_label:=CASE NEW.action WHEN 'clock_in' THEN 'Clock-in' ELSE 'Clock-out' END;
  v_payload:=jsonb_build_object('text',format('%s : %s %s%s%s',v_label,
    COALESCE(to_char(v_employee.event_time,'HH24:MI'),'--:--'),v_employee.attendance_date,E'\n',
    concat_ws(' - ',concat_ws(' ',v_employee.first_name,v_employee.last_name),COALESCE(v_employee.position,'Employee'))||E'\n'||
    initcap(replace(v_employee.status::text,'-',' '))),
    'username','WFH-PULSE Attendance Bot','icon_emoji',':alarm_clock:');
  PERFORM net.http_post(url:=v_webhook,body:=v_payload,
    headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=5000);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION wfh_private.queue_slack_attendance_notification() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS wfh_slack_attendance_notify ON app.attendance_activity_logs;
CREATE TRIGGER wfh_slack_attendance_notify
AFTER INSERT ON app.attendance_activity_logs
FOR EACH ROW EXECUTE FUNCTION wfh_private.queue_slack_attendance_notification();

CREATE OR REPLACE FUNCTION wfh_private.gemini_leave_insights(p_plans jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_api_key text;
  v_request extensions.http_request;
  v_response extensions.http_response;
  v_request_payload jsonb;
  v_text text;
  v_insights jsonb;
BEGIN
  IF auth.uid() IS NULL OR jsonb_typeof(p_plans) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_plans) NOT BETWEEN 1 AND 3 THEN
    RETURN jsonb_build_object('status',400,'body',jsonb_build_object('error','Invalid leave-plan request.'));
  END IF;
  SELECT decrypted_secret INTO v_api_key FROM vault.decrypted_secrets
    WHERE name='gemini_api_key' LIMIT 1;
  IF COALESCE(v_api_key,'')='' THEN
    RETURN jsonb_build_object('status',503,'body',jsonb_build_object('error','Gemini is not configured. The built-in planner remains available.'));
  END IF;
  PERFORM set_config('http.curlopt_connecttimeout_ms','3000',true);
  PERFORM set_config('http.curlopt_timeout_ms','12000',true);
  v_request_payload:=jsonb_build_object('contents',jsonb_build_array(
    jsonb_build_object('role','user','parts',jsonb_build_array(
      jsonb_build_object('text','You are helping an employee plan leave. Return ONLY a valid JSON array with one object per provided range. Each object must have keys: rangeStart, rangeEnd, bullets, events. bullets must have exactly 2 short strings explaining schedule quality. events may list up to 4 possible local/community/public events or festivals outside registered company holidays, prioritizing the Philippines, Australia, and the United States. Prefix each event with the country name. If uncertain, return an empty events array. Date ranges: '||p_plans::text)
    ))
  ));
  v_request:=ROW('POST'::extensions.http_method,'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    ARRAY[extensions.http_header('Content-Type','application/json'),extensions.http_header('x-goog-api-key',v_api_key)]::extensions.http_header[],
    'application/json',v_request_payload::text)::extensions.http_request;
  SELECT * INTO v_response FROM extensions.http(v_request);
  IF v_response.status<200 OR v_response.status>=300 THEN
    RETURN jsonb_build_object('status',503,'body',jsonb_build_object('error','Unable to fetch live AI schedule context.'));
  END IF;
  v_text:=v_response.content::jsonb#>>'{candidates,0,content,parts,0,text}';
  IF COALESCE(v_text,'')='' THEN
    RETURN jsonb_build_object('status',503,'body',jsonb_build_object('error','Gemini returned no schedule insights.'));
  END IF;
  v_text:=regexp_replace(regexp_replace(btrim(v_text),'^```json\s*','','i'),'\s*```$','');
  v_insights:=v_text::jsonb;
  IF jsonb_typeof(v_insights)<>'array' THEN
    RETURN jsonb_build_object('status',503,'body',jsonb_build_object('error','Gemini returned an invalid response.'));
  END IF;
  RETURN jsonb_build_object('status',200,'body',jsonb_build_object('insights',v_insights));
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('status',503,'body',jsonb_build_object('error','Unable to fetch live AI schedule context.'));
END;
$$;
REVOKE ALL ON FUNCTION wfh_private.gemini_leave_insights(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION wfh_private.gemini_leave_insights(jsonb) TO authenticated;

COMMIT;
