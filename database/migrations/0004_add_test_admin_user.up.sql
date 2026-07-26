INSERT INTO auth.users (employee_id, email, password_hash, is_active, biometric_enabled, dark_mode_enabled, location)
VALUES (NULL, 'test@mit.co', crypt('testpass', gen_salt('bf', 10)), TRUE, FALSE, FALSE, NULL)
ON CONFLICT (email) DO NOTHING;

INSERT INTO auth.user_roles (user_id, role_id)
SELECT u.user_id, r.role_id
FROM auth.users u
JOIN auth.roles r ON r.role_name = 'admin'
WHERE u.email = 'test@mit.co'
ON CONFLICT DO NOTHING;

