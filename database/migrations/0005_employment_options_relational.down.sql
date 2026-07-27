CREATE OR REPLACE FUNCTION app.enforce_employee_self_update_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF app.is_hr_or_admin() THEN
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF app.current_employee_id() IS NULL OR OLD.employee_id <> app.current_employee_id() THEN
    RAISE EXCEPTION 'Self-service updates are allowed only for your own employee profile';
  END IF;

  IF NEW.employee_code IS DISTINCT FROM OLD.employee_code
    OR NEW.first_name IS DISTINCT FROM OLD.first_name
    OR NEW.last_name IS DISTINCT FROM OLD.last_name
    OR NEW.department_id IS DISTINCT FROM OLD.department_id
    OR NEW.position IS DISTINCT FROM OLD.position
    OR NEW.attendance_status IS DISTINCT FROM OLD.attendance_status
    OR NEW.employment_status IS DISTINCT FROM OLD.employment_status
    OR NEW.employment_type IS DISTINCT FROM OLD.employment_type
    OR NEW.clock_in_time IS DISTINCT FROM OLD.clock_in_time
    OR NEW.clock_out_time IS DISTINCT FROM OLD.clock_out_time
    OR NEW.work_duration_minutes IS DISTINCT FROM OLD.work_duration_minutes
    OR NEW.late_minutes IS DISTINCT FROM OLD.late_minutes
    OR NEW.join_date IS DISTINCT FROM OLD.join_date
    OR NEW.invitation_sent_date IS DISTINCT FROM OLD.invitation_sent_date
    OR NEW.password_changed IS DISTINCT FROM OLD.password_changed
  THEN
    RAISE EXCEPTION 'You are not allowed to modify protected employee fields';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

ALTER TABLE app.employees
  DROP COLUMN IF EXISTS position_id;

DROP TABLE IF EXISTS app.job_positions;

-- Enum values and inserted department rows are intentionally retained to avoid
-- data loss and because PostgreSQL enum value removal is not safe in down migrations.
