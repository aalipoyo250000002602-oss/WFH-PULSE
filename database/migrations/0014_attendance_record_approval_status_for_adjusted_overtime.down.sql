DROP TRIGGER IF EXISTS trg_cleanup_request_records_on_delete ON app.attendance_adjustment_requests;
DROP TRIGGER IF EXISTS trg_sync_approved_request_to_attendance_records ON app.attendance_adjustment_requests;

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

CREATE TRIGGER trg_sync_approved_request_to_attendance_records
AFTER INSERT OR UPDATE OF status, request_date, clock_in_time, clock_out_time, total_work_duration_minutes, break_duration_minutes, source_page
ON app.attendance_adjustment_requests
FOR EACH ROW
EXECUTE FUNCTION app.sync_approved_request_to_attendance_records();

ALTER TABLE app.attendance_records
  DROP COLUMN IF EXISTS approval_status;
