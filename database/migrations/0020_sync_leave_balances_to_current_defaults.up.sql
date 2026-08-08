WITH managed_leave_type_ids AS (
  SELECT leave_type_id, default_limit_days
  FROM app.leave_types
  WHERE leave_type_id IN (
    'bereavement',
    'compensatory',
    'emergency',
    'paternity',
    'sick',
    'solo-parent',
    'vacation'
  )
)
INSERT INTO app.leave_balances (
  employee_id,
  leave_type_id,
  credits,
  accrued,
  limit_days
)
SELECT
  e.employee_id,
  m.leave_type_id,
  m.default_limit_days,
  m.default_limit_days,
  m.default_limit_days
FROM app.employees e
CROSS JOIN managed_leave_type_ids m
ON CONFLICT (employee_id, leave_type_id) DO UPDATE
SET
  credits = EXCLUDED.credits,
  accrued = EXCLUDED.accrued,
  limit_days = EXCLUDED.limit_days;
