DELETE FROM app_auth.user_roles
WHERE user_id IN (
  SELECT user_id FROM app_auth.users WHERE email = 'test@mit.co'
);

DELETE FROM app_auth.users
WHERE email = 'test@mit.co';

