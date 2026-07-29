WITH ranked AS (
  SELECT
    attendance_id,
    ROW_NUMBER() OVER (
      PARTITION BY employee_id, attendance_date, record_type
      ORDER BY attendance_id DESC
    ) AS rn
  FROM app.attendance_records
  WHERE record_type IS NOT NULL
)
DELETE FROM app.attendance_records ar
USING ranked r
WHERE ar.attendance_id = r.attendance_id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_records_employee_date_type
  ON app.attendance_records (employee_id, attendance_date, record_type);
