-- Recipient-scoped request events. Apply after 07_supabase_rest_api.sql.
CREATE TABLE IF NOT EXISTS app.push_devices (
  device_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES app_auth.users(user_id) ON DELETE CASCADE,
  binding_id uuid NOT NULL DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('ios','android')),
  token text NOT NULL CHECK (length(token) BETWEEN 20 AND 4096),
  apns_environment text NOT NULL DEFAULT 'production' CHECK (apns_environment IN ('production','sandbox')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(platform,token)
);
CREATE TABLE IF NOT EXISTS app.request_notifications (
  notification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES app_auth.users(user_id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES app_auth.users(user_id) ON DELETE SET NULL,
  request_type text NOT NULL CHECK (request_type IN ('leave','adjustment','overtime')),
  request_id text NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('submitted','requester_updated','status_changed')),
  request_status text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS request_notifications_recipient_idx
  ON app.request_notifications(recipient_user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS app.push_deliveries (
  notification_id uuid NOT NULL REFERENCES app.request_notifications(notification_id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES app.push_devices(device_id) ON DELETE CASCADE,
  binding_id uuid NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  leased_until timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  last_error text,
  PRIMARY KEY(notification_id,device_id)
);
CREATE INDEX IF NOT EXISTS push_deliveries_pending_idx ON app.push_deliveries(next_attempt_at)
  WHERE delivered_at IS NULL AND failed_at IS NULL;
ALTER TABLE app.push_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.request_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.push_devices,app.request_notifications,app.push_deliveries FROM anon,authenticated;

ALTER TABLE app.leave_requests ADD COLUMN IF NOT EXISTS requestor_user_id uuid
  REFERENCES app_auth.users(user_id) ON DELETE SET NULL;
ALTER TABLE app.attendance_adjustment_requests ADD COLUMN IF NOT EXISTS requestor_user_id uuid
  REFERENCES app_auth.users(user_id) ON DELETE SET NULL;
-- Attribute historical requests only when the employee has exactly one active account.
UPDATE app.leave_requests r SET requestor_user_id=u.user_id
FROM app_auth.users u WHERE r.requestor_user_id IS NULL AND u.is_active AND u.employee_id=r.employee_id
AND 1=(SELECT count(*) FROM app_auth.users x WHERE x.employee_id=r.employee_id AND x.is_active);
UPDATE app.attendance_adjustment_requests r SET requestor_user_id=u.user_id
FROM app_auth.users u WHERE r.requestor_user_id IS NULL AND u.is_active AND u.employee_id=r.employee_id
AND 1=(SELECT count(*) FROM app_auth.users x WHERE x.employee_id=r.employee_id AND x.is_active);

CREATE OR REPLACE FUNCTION wfh_private.bind_request_creator()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=app.current_user_id();
BEGIN
  IF TG_OP='UPDATE' THEN
    NEW.requestor_user_id:=OLD.requestor_user_id;
  ELSE
    -- Request ownership comes from the authenticated transaction, never the body.
    SELECT u.user_id INTO NEW.requestor_user_id FROM app_auth.users u
    WHERE u.user_id=v_actor AND u.employee_id=NEW.employee_id AND u.is_active;
    IF NEW.requestor_user_id IS NULL THEN
      SELECT u.user_id INTO NEW.requestor_user_id FROM app_auth.users u
      WHERE u.employee_id=NEW.employee_id AND u.is_active
      AND 1=(SELECT count(*) FROM app_auth.users x WHERE x.employee_id=NEW.employee_id AND x.is_active);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION wfh_private.bind_request_creator() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wfh_private.queue_request_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_actor uuid:=app.current_user_id();
  v_manager boolean;
  v_kind text;
  v_type text;
  v_title text;
  v_body text;
  v_recipient uuid;
  v_notification uuid;
BEGIN
  -- Seed imports and maintenance without an authenticated actor must stay quiet.
  IF v_actor IS NULL OR NEW.requestor_user_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM app_auth.users WHERE user_id=v_actor AND is_active
  ) THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  END IF;
  v_manager:=EXISTS(SELECT 1 FROM app_auth.user_roles ur JOIN app_auth.roles r ON r.role_id=ur.role_id
    WHERE ur.user_id=v_actor AND r.role_name IN ('admin','hr_manager'));
  v_type:=CASE WHEN TG_TABLE_NAME='leave_requests' THEN 'leave'
    WHEN NEW.source_page='home-overtime' THEN 'overtime' ELSE 'adjustment' END;
  IF TG_OP='INSERT' THEN
    v_kind:='submitted';
    v_title:='New '||v_type||' request';
    v_body:='A new '||v_type||' request is waiting for review.';
  ELSIF v_manager AND v_actor<>NEW.requestor_user_id THEN
    v_kind:='status_changed';
    v_title:=initcap(v_type)||' request updated';
    v_body:='Your '||v_type||' request is now '||NEW.status::text||'.';
  ELSIF v_actor=NEW.requestor_user_id THEN
    v_kind:='requester_updated';
    v_title:=initcap(v_type)||' request updated';
    v_body:='The requester changed a '||v_type||' request to '||NEW.status::text||'.';
  ELSE RETURN NEW;
  END IF;
  FOR v_recipient IN
    SELECT u.user_id FROM app_auth.users u WHERE u.is_active AND u.user_id<>v_actor AND (
      (v_kind='status_changed' AND u.user_id=NEW.requestor_user_id)
      OR (v_kind IN ('submitted','requester_updated') AND EXISTS(
        SELECT 1 FROM app_auth.user_roles ur JOIN app_auth.roles r ON r.role_id=ur.role_id
        WHERE ur.user_id=u.user_id AND r.role_name='admin'))
    )
  LOOP
    INSERT INTO app.request_notifications(recipient_user_id,actor_user_id,request_type,request_id,event_kind,request_status,title,body)
    VALUES(v_recipient,v_actor,v_type,NEW.request_id,v_kind,NEW.status::text,v_title,v_body)
    RETURNING notification_id INTO v_notification;
    INSERT INTO app.push_deliveries(notification_id,device_id,binding_id)
    SELECT v_notification,d.device_id,d.binding_id FROM app.push_devices d WHERE d.user_id=v_recipient;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION wfh_private.queue_request_notification() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS wfh_request_creator ON app.leave_requests;
CREATE TRIGGER wfh_request_creator BEFORE INSERT OR UPDATE ON app.leave_requests
FOR EACH ROW EXECUTE FUNCTION wfh_private.bind_request_creator();
DROP TRIGGER IF EXISTS wfh_request_creator ON app.attendance_adjustment_requests;
CREATE TRIGGER wfh_request_creator BEFORE INSERT OR UPDATE ON app.attendance_adjustment_requests
FOR EACH ROW EXECUTE FUNCTION wfh_private.bind_request_creator();
DROP TRIGGER IF EXISTS wfh_request_notify ON app.leave_requests;
CREATE TRIGGER wfh_request_notify AFTER INSERT OR UPDATE OF status ON app.leave_requests
FOR EACH ROW EXECUTE FUNCTION wfh_private.queue_request_notification();
DROP TRIGGER IF EXISTS wfh_request_notify ON app.attendance_adjustment_requests;
CREATE TRIGGER wfh_request_notify AFTER INSERT OR UPDATE OF status ON app.attendance_adjustment_requests
FOR EACH ROW EXECUTE FUNCTION wfh_private.queue_request_notification();

-- Backend-only helper. Both the REST RPC and Express pass a server-resolved user.
CREATE OR REPLACE FUNCTION wfh_private.push_device_request(p_user uuid,p_method text,p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_install uuid; v_binding uuid; v_environment text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM app_auth.users WHERE user_id=p_user AND is_active) THEN
    RETURN jsonb_build_object('status',403,'body',jsonb_build_object('error','Inactive account.'));
  END IF;
  IF jsonb_typeof(p_body) IS DISTINCT FROM 'object' OR COALESCE(p_body->>'installationId','') !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN jsonb_build_object('status',400,'body',jsonb_build_object('error','Invalid installation ID.'));
  END IF;
  v_install:=(p_body->>'installationId')::uuid;
  IF upper(p_method)='DELETE' THEN
    DELETE FROM app.push_devices WHERE installation_id=v_install AND user_id=p_user;
    RETURN jsonb_build_object('status',200,'body',jsonb_build_object('ok',true));
  END IF;
  v_environment:=COALESCE(p_body->>'apnsEnvironment','production');
  IF upper(p_method)<>'PUT' OR COALESCE(p_body->>'platform','') NOT IN ('ios','android')
    OR jsonb_typeof(p_body->'token') IS DISTINCT FROM 'string'
    OR length(COALESCE(p_body->>'token','')) NOT BETWEEN 20 AND 4096
    OR (p_body->>'platform'='ios' AND p_body->>'token' !~ '^[0-9a-fA-F]+$')
    OR v_environment NOT IN ('sandbox','production') THEN
    RETURN jsonb_build_object('status',400,'body',jsonb_build_object('error','Invalid push registration.'));
  END IF;
  -- A token belongs to only one account/installation at a time.
  DELETE FROM app.push_devices WHERE platform=p_body->>'platform' AND token=p_body->>'token'
    AND installation_id<>v_install;
  INSERT INTO app.push_devices(installation_id,user_id,platform,token,apns_environment)
  VALUES(v_install,p_user,p_body->>'platform',p_body->>'token',v_environment)
  ON CONFLICT(installation_id) DO UPDATE SET user_id=EXCLUDED.user_id,platform=EXCLUDED.platform,
    token=EXCLUDED.token,apns_environment=EXCLUDED.apns_environment,updated_at=now(),
    binding_id=CASE WHEN app.push_devices.user_id=EXCLUDED.user_id THEN app.push_devices.binding_id ELSE gen_random_uuid() END
  RETURNING binding_id INTO v_binding;
  RETURN jsonb_build_object('status',200,'body',jsonb_build_object('bindingId',v_binding));
END;
$$;
REVOKE ALL ON FUNCTION wfh_private.push_device_request(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wfh_private.push_device_for_auth(p_method text,p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('status',401,'body',jsonb_build_object('error','Sign in first.'));
  END IF;
  SELECT u.user_id INTO v_user FROM auth.users a JOIN app_auth.users u ON
    u.supabase_auth_user_id=a.id OR (u.supabase_auth_user_id IS NULL AND lower(u.email::text)=lower(a.email)
    AND a.email_confirmed_at IS NOT NULL)
  WHERE a.id=auth.uid() AND u.is_active ORDER BY (u.supabase_auth_user_id=a.id) DESC NULLS LAST LIMIT 1;
  RETURN wfh_private.push_device_request(v_user,p_method,p_body);
END;
$$;
REVOKE ALL ON FUNCTION wfh_private.push_device_for_auth(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION wfh_private.push_device_for_auth(text,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION api.wfh_pulse_request(
 p_path text,p_method text DEFAULT 'GET',p_query jsonb DEFAULT '{}'::jsonb,p_body jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN p_path='/me/push-devices'
   THEN wfh_private.push_device_for_auth(p_method,p_body)
   ELSE wfh_private.request(p_path,p_method,p_query,p_body) END;
$$;
REVOKE ALL ON FUNCTION api.wfh_pulse_request(text,text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION api.wfh_pulse_request(text,text,jsonb,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
