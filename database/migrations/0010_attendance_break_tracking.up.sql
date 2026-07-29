ALTER TABLE app.attendance_records
  ADD COLUMN IF NOT EXISTS total_break_duration_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_break_started_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS app.attendance_break_logs (
  break_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attendance_id BIGINT NOT NULL REFERENCES app.attendance_records(attendance_id) ON DELETE CASCADE,
  break_started_at TIMESTAMPTZ NOT NULL,
  break_ended_at TIMESTAMPTZ,
  break_duration_minutes INTEGER,
  CHECK (break_ended_at IS NULL OR break_ended_at >= break_started_at),
  CHECK (break_duration_minutes IS NULL OR break_duration_minutes >= 0)
);

CREATE INDEX IF NOT EXISTS idx_attendance_break_logs_attendance_started
  ON app.attendance_break_logs (attendance_id, break_started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_break_logs_single_open_break
  ON app.attendance_break_logs (attendance_id)
  WHERE break_ended_at IS NULL;

ALTER TABLE app.attendance_break_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_break_logs_select ON app.attendance_break_logs;
CREATE POLICY attendance_break_logs_select ON app.attendance_break_logs
  FOR SELECT USING (
    app.is_hr_or_admin() OR EXISTS (
      SELECT 1
      FROM app.attendance_records ar
      WHERE ar.attendance_id = attendance_break_logs.attendance_id
        AND ar.employee_id = app.current_employee_id()
    )
  );

DROP POLICY IF EXISTS attendance_break_logs_write ON app.attendance_break_logs;
CREATE POLICY attendance_break_logs_write ON app.attendance_break_logs
  FOR ALL USING (
    app.is_hr_or_admin() OR EXISTS (
      SELECT 1
      FROM app.attendance_records ar
      WHERE ar.attendance_id = attendance_break_logs.attendance_id
        AND ar.employee_id = app.current_employee_id()
    )
  )
  WITH CHECK (
    app.is_hr_or_admin() OR EXISTS (
      SELECT 1
      FROM app.attendance_records ar
      WHERE ar.attendance_id = attendance_break_logs.attendance_id
        AND ar.employee_id = app.current_employee_id()
    )
  );
