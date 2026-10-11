WITH target_weekdays AS (
  SELECT day_value::date AS attendance_date
  FROM generate_series(
    MAKE_DATE(EXTRACT(YEAR FROM CURRENT_DATE)::INT, 10, 1),
    CURRENT_DATE,
    INTERVAL '1 day'
  ) AS generated(day_value)
  WHERE EXTRACT(ISODOW FROM day_value) BETWEEN 1 AND 5
),
employee_days AS (
  SELECT
    e.employee_id,
    tw.attendance_date
  FROM app.employees e
  CROSS JOIN target_weekdays tw
)
INSERT INTO app.attendance_records (
  employee_id,
  attendance_date,
  record_type,
  source_request_page,
  approval_status,
  status,
  clock_in,
  clock_out,
  work_duration_minutes,
  total_break_duration_minutes,
  active_break_started_at,
  late_minutes
)
SELECT
  ed.employee_id,
  ed.attendance_date,
  'actual'::app.attendance_record_type,
  'seed-oct-to-current-present',
  'approved'::app.request_status,
  'present'::app.attendance_status,
  TIME '09:00',
  TIME '17:00',
  480,
  0,
  NULL,
  0
FROM employee_days ed
ON CONFLICT (employee_id, attendance_date, record_type) DO UPDATE
SET
  source_request_page = EXCLUDED.source_request_page,
  approval_status = EXCLUDED.approval_status,
  status = EXCLUDED.status,
  clock_in = EXCLUDED.clock_in,
  clock_out = EXCLUDED.clock_out,
  work_duration_minutes = EXCLUDED.work_duration_minutes,
  total_break_duration_minutes = EXCLUDED.total_break_duration_minutes,
  active_break_started_at = EXCLUDED.active_break_started_at,
  late_minutes = EXCLUDED.late_minutes;