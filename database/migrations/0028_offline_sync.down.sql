CREATE OR REPLACE FUNCTION api.wfh_pulse_request(
 p_path text,p_method text DEFAULT 'GET',p_query jsonb DEFAULT '{}'::jsonb,p_body jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN p_path='/me/push-devices' THEN wfh_private.push_device_for_auth(p_method,p_body)
 ELSE wfh_private.request(p_path,p_method,p_query,p_body) END;
$$;
DROP FUNCTION IF EXISTS wfh_private.sync_offline_operation(jsonb);
DROP FUNCTION IF EXISTS wfh_private.sync_offline_attendance(uuid,text,text,timestamptz,uuid);
-- Keep private receipts so a later re-enable cannot replay already committed actions.
NOTIFY pgrst,'reload schema';
