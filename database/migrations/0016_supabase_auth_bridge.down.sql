DROP FUNCTION IF EXISTS app_auth.link_supabase_user(UUID, CITEXT, TEXT, TEXT);

DROP INDEX IF EXISTS idx_app_auth_users_supabase_auth_user_id;

ALTER TABLE app_auth.users
  DROP COLUMN IF EXISTS supabase_auth_user_id;
