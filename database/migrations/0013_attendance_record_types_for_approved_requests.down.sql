DROP TRIGGER IF EXISTS trg_sync_approved_request_to_attendance_records ON app.attendance_adjustment_requests;
DROP FUNCTION IF EXISTS app.sync_approved_request_to_attendance_records();

DELETE FROM app.attendance_records
WHERE record_type IN ('adjusted'::app.attendance_record_type, 'overtime'::app.attendance_record_type)
   OR source_request_id IS NOT NULL;

DROP INDEX IF EXISTS uq_attendance_records_source_request;
DROP INDEX IF EXISTS uq_attendance_records_employee_date_type;

ALTER TABLE app.attendance_records
  DROP COLUMN IF EXISTS source_request_page,
  DROP COLUMN IF EXISTS source_request_id,
  DROP COLUMN IF EXISTS record_type;

ALTER TABLE app.attendance_records
  ADD CONSTRAINT attendance_records_employee_id_attendance_date_key UNIQUE (employee_id, attendance_date);

DROP TYPE IF EXISTS app.attendance_record_type;
