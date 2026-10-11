DROP POLICY IF EXISTS slack_notification_logs_write ON app.slack_notification_logs;
DROP POLICY IF EXISTS slack_notification_logs_select ON app.slack_notification_logs;

DROP TABLE IF EXISTS app.slack_notification_logs;
