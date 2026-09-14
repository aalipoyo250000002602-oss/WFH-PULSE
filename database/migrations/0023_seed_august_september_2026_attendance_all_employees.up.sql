WITH target_weekdays AS (
  SELECT day_value::date AS attendance_date
  FROM generate_series(
    DATE '2026-08-13',
    DATE '2026-09-14',
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
),
ranked_employee_days AS (
  SELECT
    ed.employee_id,
    ed.attendance_date,
    ROW_NUMBER() OVER (
      PARTITION BY ed.employee_id
      ORDER BY MD5(ed.employee_id || ':' || ed.attendance_date::text)
    ) AS random_rank
  FROM employee_days ed
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
  rmd.employee_id,
  rmd.attendance_date,
  'actual'::app.attendance_record_type,
  'seed-aug-sep-2026',
  'approved'::app.request_status,
  CASE
    WHEN rmd.random_rank <= 2 THEN 'absent'::app.attendance_status
    WHEN rmd.random_rank <= 4 THEN 'late'::app.attendance_status
    ELSE 'present'::app.attendance_status
  END,
  CASE
    WHEN rmd.random_rank <= 2 THEN NULL
    WHEN rmd.random_rank <= 4 THEN TIME '09:30'
    ELSE TIME '09:00'
  END,
  CASE
    WHEN rmd.random_rank <= 2 THEN NULL
    WHEN rmd.random_rank <= 4 THEN TIME '17:30'
    ELSE TIME '17:00'
  END,
  CASE WHEN rmd.random_rank <= 2 THEN 0 ELSE 480 END,
  0,
  NULL,
  CASE
    WHEN rmd.random_rank > 2 AND rmd.random_rank <= 4 THEN 30
    ELSE 0
  END
FROM ranked_employee_days rmd
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
