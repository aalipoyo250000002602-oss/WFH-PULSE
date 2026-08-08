WITH managed_leave_types AS (
  SELECT *
  FROM (
    VALUES
      ('bereavement', 'Bereavement Leave'),
      ('compensatory', 'Compensatory Time Off'),
      ('emergency', 'Emergency Leave'),
      ('paternity', 'Paternity Leave'),
      ('sick', 'Sick Leave'),
      ('solo-parent', 'Solo Parent Leave'),
      ('vacation', 'Vacation Leave')
  ) AS t(leave_type_id, leave_type_name)
)
INSERT INTO app.leave_types (leave_type_id, name, default_limit_days)
SELECT
  m.leave_type_id,
  m.leave_type_name,
  5
FROM managed_leave_types m
ON CONFLICT (leave_type_id) DO UPDATE
SET
  name = EXCLUDED.name,
  default_limit_days = 5;

WITH managed_leave_type_ids AS (
  SELECT leave_type_id
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
  5,
  5,
  5
FROM app.employees e
CROSS JOIN managed_leave_type_ids m
ON CONFLICT (employee_id, leave_type_id) DO UPDATE
SET
  credits = 5,
  accrued = 5,
  limit_days = 5;
