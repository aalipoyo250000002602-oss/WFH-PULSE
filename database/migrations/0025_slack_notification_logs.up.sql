CREATE TABLE IF NOT EXISTS app.slack_notification_logs (
  notification_log_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attendance_id BIGINT REFERENCES app.attendance_records(attendance_id) ON DELETE SET NULL,
  employee_id TEXT NOT NULL REFERENCES app.employees(employee_id) ON DELETE CASCADE,
  event_action TEXT NOT NULL CHECK (event_action IN ('clock_in', 'clock_out')),
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('success', 'failed')),
  message_text TEXT,
  http_status INTEGER,
  error_message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slack_notification_logs_employee_created
  ON app.slack_notification_logs (employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_slack_notification_logs_attendance_created
  ON app.slack_notification_logs (attendance_id, created_at DESC);

ALTER TABLE app.slack_notification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS slack_notification_logs_select ON app.slack_notification_logs;
CREATE POLICY slack_notification_logs_select ON app.slack_notification_logs
  FOR SELECT USING (
    app.is_hr_or_admin() OR employee_id = app.current_employee_id()
  );

DROP POLICY IF EXISTS slack_notification_logs_write ON app.slack_notification_logs;
CREATE POLICY slack_notification_logs_write ON app.slack_notification_logs
  FOR ALL USING (
    app.is_hr_or_admin() OR employee_id = app.current_employee_id()
  )
  WITH CHECK (
    app.is_hr_or_admin() OR employee_id = app.current_employee_id()
  );