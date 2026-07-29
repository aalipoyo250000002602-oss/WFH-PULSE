CREATE TABLE IF NOT EXISTS app.attendance_activity_logs (
  activity_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attendance_id BIGINT NOT NULL REFERENCES app.attendance_records(attendance_id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES app.employees(employee_id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('clock_in', 'clock_out', 'break_start', 'break_end')),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_attendance_activity_logs_attendance
  ON app.attendance_activity_logs (attendance_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_activity_logs_employee
  ON app.attendance_activity_logs (employee_id, logged_at DESC);

ALTER TABLE app.attendance_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_activity_logs_select ON app.attendance_activity_logs;
CREATE POLICY attendance_activity_logs_select ON app.attendance_activity_logs
  FOR SELECT USING (
    app.is_hr_or_admin() OR employee_id = app.current_employee_id()
  );

DROP POLICY IF EXISTS attendance_activity_logs_write ON app.attendance_activity_logs;
CREATE POLICY attendance_activity_logs_write ON app.attendance_activity_logs
  FOR ALL USING (
    app.is_hr_or_admin() OR employee_id = app.current_employee_id()
  )
  WITH CHECK (
    app.is_hr_or_admin() OR employee_id = app.current_employee_id()
  );
