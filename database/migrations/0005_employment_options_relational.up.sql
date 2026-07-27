ALTER TYPE app.employment_type ADD VALUE IF NOT EXISTS 'part-time';
ALTER TYPE app.employment_type ADD VALUE IF NOT EXISTS 'intern';
ALTER TYPE app.employment_type ADD VALUE IF NOT EXISTS 'contract-to-hire';
ALTER TYPE app.employment_type ADD VALUE IF NOT EXISTS 'project-based';
ALTER TYPE app.employment_type ADD VALUE IF NOT EXISTS 'temporary';
ALTER TYPE app.employment_type ADD VALUE IF NOT EXISTS 'consultant';
ALTER TYPE app.employment_type ADD VALUE IF NOT EXISTS 'freelance';
ALTER TYPE app.employment_type ADD VALUE IF NOT EXISTS 'apprentice';

INSERT INTO app.departments (name)
VALUES
  ('Software Engineering'),
  ('Quality Assurance'),
  ('DevOps & Infrastructure'),
  ('Data Engineering'),
  ('IT Support')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS app.job_positions (
  position_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  department_id BIGINT NOT NULL REFERENCES app.departments(department_id) ON DELETE RESTRICT,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app.employees
  ADD COLUMN IF NOT EXISTS position_id BIGINT REFERENCES app.job_positions(position_id);

INSERT INTO app.job_positions (department_id, name)
SELECT d.department_id, v.name
FROM app.departments d
JOIN (
  VALUES
    ('Software Engineering', 'Frontend Engineer'),
    ('Software Engineering', 'Backend Engineer'),
    ('Software Engineering', 'Full Stack Engineer'),
    ('Software Engineering', 'Mobile App Engineer'),
    ('Quality Assurance', 'QA Engineer'),
    ('DevOps & Infrastructure', 'DevOps Engineer'),
    ('Data Engineering', 'Data Engineer'),
    ('Data Engineering', 'Data Analyst'),
    ('IT Support', 'IT Support Specialist'),
    ('Software Engineering', 'Solutions Architect')
) AS v(department_name, name)
  ON d.name = v.department_name
ON CONFLICT (name) DO NOTHING;

UPDATE app.employees e
SET position_id = jp.position_id
FROM app.job_positions jp
WHERE e.position_id IS NULL
  AND e.position = jp.name;

UPDATE app.employees e
SET position = jp.name
FROM app.job_positions jp
WHERE e.position_id = jp.position_id
  AND (e.position IS DISTINCT FROM jp.name OR e.position IS NULL);

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
    OR NEW.attendance_status IS DISTINCT FROM OLD.attendance_status
    OR NEW.employment_status IS DISTINCT FROM OLD.employment_status
    OR NEW.clock_in_time IS DISTINCT FROM OLD.clock_in_time
    OR NEW.clock_out_time IS DISTINCT FROM OLD.clock_out_time
    OR NEW.work_duration_minutes IS DISTINCT FROM OLD.work_duration_minutes
    OR NEW.late_minutes IS DISTINCT FROM OLD.late_minutes
    OR NEW.invitation_sent_date IS DISTINCT FROM OLD.invitation_sent_date
    OR NEW.password_changed IS DISTINCT FROM OLD.password_changed
  THEN
    RAISE EXCEPTION 'You are not allowed to modify protected employee fields';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;
