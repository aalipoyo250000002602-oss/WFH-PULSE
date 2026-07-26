DELETE FROM auth.user_roles
WHERE user_id IN (
  SELECT user_id FROM auth.users WHERE email = 'test@mit.co'
);

DELETE FROM auth.users
WHERE email = 'test@mit.co';

