DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'attendance_record_type'
      AND n.nspname = 'app'
  ) THEN
    CREATE TYPE app.attendance_record_type AS ENUM ('actual', 'adjusted', 'overtime');
  END IF;
END;
$$;

ALTER TABLE app.attendance_records
  ADD COLUMN IF NOT EXISTS record_type app.attendance_record_type,
  ADD COLUMN IF NOT EXISTS source_request_id TEXT,
  ADD COLUMN IF NOT EXISTS source_request_page TEXT;

UPDATE app.attendance_records
SET record_type = 'actual'::app.attendance_record_type
WHERE record_type IS NULL;

ALTER TABLE app.attendance_records
  ALTER COLUMN record_type SET DEFAULT 'actual'::app.attendance_record_type,
  ALTER COLUMN record_type SET NOT NULL;

ALTER TABLE app.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_employee_id_attendance_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_records_employee_date_type
  ON app.attendance_records (employee_id, attendance_date, record_type);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_records_source_request
  ON app.attendance_records (source_request_id)
  WHERE source_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.sync_approved_request_to_attendance_records()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_record_type app.attendance_record_type;
  target_break_minutes INTEGER;
BEGIN
  IF NEW.employee_id IS NULL OR NEW.request_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved'::app.request_status THEN
    IF NEW.source_page = 'home' THEN
      target_record_type := 'adjusted'::app.attendance_record_type;
      target_break_minutes := COALESCE(NEW.break_duration_minutes, 0);
    ELSIF NEW.source_page = 'home-overtime' THEN
      target_record_type := 'overtime'::app.attendance_record_type;
      target_break_minutes := 0;
    ELSE
      RETURN NEW;
    END IF;

    DELETE FROM app.attendance_records
    WHERE source_request_id = NEW.request_id;

    INSERT INTO app.attendance_records (
      employee_id,
      attendance_date,
      record_type,
      source_request_id,
      source_request_page,
      status,
      clock_in,
      clock_out,
      work_duration_minutes,
      total_break_duration_minutes,
      active_break_started_at,
      late_minutes
    )
    VALUES (
      NEW.employee_id,
      NEW.request_date,
      target_record_type,
      NEW.request_id,
      NEW.source_page,
      'present'::app.attendance_status,
      NULLIF(NEW.clock_in_time, '')::time,
      NULLIF(NEW.clock_out_time, '')::time,
      COALESCE(NEW.total_work_duration_minutes, 0),
      target_break_minutes,
      NULL,
      0
    )
    ON CONFLICT (employee_id, attendance_date, record_type)
    DO UPDATE SET
      source_request_id = EXCLUDED.source_request_id,
      source_request_page = EXCLUDED.source_request_page,
      status = EXCLUDED.status,
      clock_in = EXCLUDED.clock_in,
      clock_out = EXCLUDED.clock_out,
      work_duration_minutes = EXCLUDED.work_duration_minutes,
      total_break_duration_minutes = EXCLUDED.total_break_duration_minutes,
      active_break_started_at = NULL,
      late_minutes = EXCLUDED.late_minutes;

    RETURN NEW;
  END IF;

  IF OLD.status = 'approved'::app.request_status
    AND NEW.status <> 'approved'::app.request_status
  THEN
    DELETE FROM app.attendance_records
    WHERE source_request_id = NEW.request_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_approved_request_to_attendance_records ON app.attendance_adjustment_requests;
CREATE TRIGGER trg_sync_approved_request_to_attendance_records
AFTER INSERT OR UPDATE OF status, request_date, clock_in_time, clock_out_time, total_work_duration_minutes, break_duration_minutes, source_page
ON app.attendance_adjustment_requests
FOR EACH ROW
EXECUTE FUNCTION app.sync_approved_request_to_attendance_records();

INSERT INTO app.attendance_records (
  employee_id,
  attendance_date,
  record_type,
  source_request_id,
  source_request_page,
  status,
  clock_in,
  clock_out,
  work_duration_minutes,
  total_break_duration_minutes,
  active_break_started_at,
  late_minutes
)
SELECT
  r.employee_id,
  r.request_date,
  CASE
    WHEN r.source_page = 'home' THEN 'adjusted'::app.attendance_record_type
    WHEN r.source_page = 'home-overtime' THEN 'overtime'::app.attendance_record_type
  END AS record_type,
  r.request_id,
  r.source_page,
  'present'::app.attendance_status,
  NULLIF(r.clock_in_time, '')::time,
  NULLIF(r.clock_out_time, '')::time,
  COALESCE(r.total_work_duration_minutes, 0),
  CASE
    WHEN r.source_page = 'home' THEN COALESCE(r.break_duration_minutes, 0)
    ELSE 0
  END,
  NULL,
  0
FROM app.attendance_adjustment_requests r
WHERE r.status = 'approved'::app.request_status
  AND r.source_page IN ('home', 'home-overtime')
  AND r.employee_id IS NOT NULL
  AND r.request_date IS NOT NULL
ON CONFLICT (employee_id, attendance_date, record_type)
DO UPDATE SET
  source_request_id = EXCLUDED.source_request_id,
  source_request_page = EXCLUDED.source_request_page,
  status = EXCLUDED.status,
  clock_in = EXCLUDED.clock_in,
  clock_out = EXCLUDED.clock_out,
  work_duration_minutes = EXCLUDED.work_duration_minutes,
  total_break_duration_minutes = EXCLUDED.total_break_duration_minutes,
  active_break_started_at = NULL,
  late_minutes = EXCLUDED.late_minutes;
