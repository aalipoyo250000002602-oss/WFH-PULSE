-- Ensure every employee has payroll profile + baseline deductions.
-- Safe to run multiple times.

SELECT set_config('app.user_role', 'admin', true);

INSERT INTO app.payroll_profiles (employee_id, salary, pag_ibig, phil_health, sss, tin)
SELECT
  e.employee_id,
  150000 + (abs(('x' || substr(md5('salary-' || e.employee_id), 1, 8))::bit(32)::int) % 20001),
  '202511111111',
  '202511111111',
  '202511111111',
  '202511111111'
FROM app.employees e
LEFT JOIN app.payroll_profiles pp ON pp.employee_id = e.employee_id
WHERE pp.employee_id IS NULL;

INSERT INTO app.payroll_deductions (deduction_id, employee_id, deduction_name, amount)
SELECT
  CASE
    WHEN e.employee_id ~ '^emp-[0-9]+$'
      THEN 'ded-' || (SUBSTRING(e.employee_id FROM 5)::INT - 1) || '-1'
    ELSE 'ded-' || substr(md5(e.employee_id || '-wt'), 1, 12) || '-1'
  END AS deduction_id,
  e.employee_id,
  'Withholding Tax' AS deduction_name,
  ROUND(pp.salary * 0.10, 2) AS amount
FROM app.employees e
JOIN app.payroll_profiles pp ON pp.employee_id = e.employee_id
WHERE NOT EXISTS (
  SELECT 1
  FROM app.payroll_deductions d
  WHERE d.employee_id = e.employee_id
    AND d.deduction_name = 'Withholding Tax'
)
ON CONFLICT (deduction_id) DO NOTHING;

INSERT INTO app.payroll_deductions (deduction_id, employee_id, deduction_name, amount)
SELECT
  CASE
    WHEN e.employee_id ~ '^emp-[0-9]+$'
      THEN 'ded-' || (SUBSTRING(e.employee_id FROM 5)::INT - 1) || '-2'
    ELSE 'ded-' || substr(md5(e.employee_id || '-hdmf'), 1, 12) || '-2'
  END AS deduction_id,
  e.employee_id,
  'Employee HDMF' AS deduction_name,
  (100 + (abs(('x' || substr(md5('hdmf-' || e.employee_id), 1, 8))::bit(32)::int) % 101))::NUMERIC AS amount
FROM app.employees e
WHERE NOT EXISTS (
  SELECT 1
  FROM app.payroll_deductions d
  WHERE d.employee_id = e.employee_id
    AND d.deduction_name = 'Employee HDMF'
)
ON CONFLICT (deduction_id) DO NOTHING;

INSERT INTO app.payroll_deductions (deduction_id, employee_id, deduction_name, amount)
SELECT
  CASE
    WHEN e.employee_id ~ '^emp-[0-9]+$'
      THEN 'ded-' || (SUBSTRING(e.employee_id FROM 5)::INT - 1) || '-3'
    ELSE 'ded-' || substr(md5(e.employee_id || '-philhealth'), 1, 12) || '-3'
  END AS deduction_id,
  e.employee_id,
  'Employee PhilHealth' AS deduction_name,
  (2100 + (abs(('x' || substr(md5('philhealth-' || e.employee_id), 1, 8))::bit(32)::int) % 901))::NUMERIC AS amount
FROM app.employees e
WHERE NOT EXISTS (
  SELECT 1
  FROM app.payroll_deductions d
  WHERE d.employee_id = e.employee_id
    AND d.deduction_name = 'Employee PhilHealth'
)
ON CONFLICT (deduction_id) DO NOTHING;

INSERT INTO app.payroll_deductions (deduction_id, employee_id, deduction_name, amount)
SELECT
  CASE
    WHEN e.employee_id ~ '^emp-[0-9]+$'
      THEN 'ded-' || (SUBSTRING(e.employee_id FROM 5)::INT - 1) || '-4'
    ELSE 'ded-' || substr(md5(e.employee_id || '-sss'), 1, 12) || '-4'
  END AS deduction_id,
  e.employee_id,
  'Employee Social Security' AS deduction_name,
  (2000 + (abs(('x' || substr(md5('sss-' || e.employee_id), 1, 8))::bit(32)::int) % 501))::NUMERIC AS amount
FROM app.employees e
WHERE NOT EXISTS (
  SELECT 1
  FROM app.payroll_deductions d
  WHERE d.employee_id = e.employee_id
    AND d.deduction_name = 'Employee Social Security'
)
ON CONFLICT (deduction_id) DO NOTHING;
