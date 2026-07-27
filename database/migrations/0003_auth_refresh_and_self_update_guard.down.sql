DROP TRIGGER IF EXISTS trg_enforce_employee_self_update_columns ON app.employees;
DROP FUNCTION IF EXISTS app.enforce_employee_self_update_columns();
DROP FUNCTION IF EXISTS app_auth.refresh_session(UUID, TEXT, INET, TEXT);

