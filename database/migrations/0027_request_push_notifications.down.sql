CREATE OR REPLACE FUNCTION api.wfh_pulse_request(
 p_path text,p_method text DEFAULT 'GET',p_query jsonb DEFAULT '{}'::jsonb,p_body jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT wfh_private.request(p_path,p_method,p_query,p_body);
$$;
DROP TRIGGER IF EXISTS wfh_request_notify ON app.leave_requests;
DROP TRIGGER IF EXISTS wfh_request_notify ON app.attendance_adjustment_requests;
DROP TRIGGER IF EXISTS wfh_request_creator ON app.leave_requests;
DROP TRIGGER IF EXISTS wfh_request_creator ON app.attendance_adjustment_requests;
DROP FUNCTION IF EXISTS wfh_private.queue_request_notification();
DROP FUNCTION IF EXISTS wfh_private.bind_request_creator();
DROP FUNCTION IF EXISTS wfh_private.push_device_for_auth(text,jsonb);
DROP FUNCTION IF EXISTS wfh_private.push_device_request(uuid,text,jsonb);
DROP TABLE IF EXISTS app.push_deliveries;
DROP TABLE IF EXISTS app.request_notifications;
DROP TABLE IF EXISTS app.push_devices;
ALTER TABLE app.leave_requests DROP COLUMN IF EXISTS requestor_user_id;
ALTER TABLE app.attendance_adjustment_requests DROP COLUMN IF EXISTS requestor_user_id;
NOTIFY pgrst,'reload schema';
