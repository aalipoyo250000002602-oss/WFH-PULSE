DROP POLICY IF EXISTS attendance_break_logs_write ON app.attendance_break_logs;
DROP POLICY IF EXISTS attendance_break_logs_select ON app.attendance_break_logs;

DROP TABLE IF EXISTS app.attendance_break_logs;

ALTER TABLE app.attendance_records
  DROP COLUMN IF EXISTS active_break_started_at,
  DROP COLUMN IF EXISTS total_break_duration_minutes;
