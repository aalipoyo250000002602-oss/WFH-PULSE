-- Restore the original UI sample employee dataset into existing databases.
-- This script is idempotent and can be rerun safely.

SELECT set_config('app.user_role', 'admin', true);

INSERT INTO app.departments (name)
VALUES
  ('Engineering'),
  ('Marketing'),
  ('Sales'),
  ('HR'),
  ('Finance'),
  ('Operations'),
  ('Customer Support'),
  ('Design'),
  ('Product'),
  ('Legal'),
  ('Analytics')
ON CONFLICT (name) DO NOTHING;

WITH
first_names AS (
  SELECT ARRAY[
    'John','Sarah','Michael','Emma','David','Lisa','James','Maria','Robert','Jennifer',
    'William','Linda','Richard','Patricia','Charles','Nancy','Thomas','Jessica','Daniel','Karen',
    'Matthew','Betty','Anthony','Helen','Mark','Sandra','Donald','Ashley','Steven','Emily'
  ] AS v
),
last_names AS (
  SELECT ARRAY[
    'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez',
    'Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin',
    'Lee','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson','Walker'
  ] AS v
),
departments AS (
  SELECT ARRAY['Engineering','Marketing','Sales','HR','Finance','Operations','Customer Support','Design','Product','Legal'] AS v
),
positions AS (
  SELECT ARRAY[
    'Senior Developer','Marketing Manager','Sales Representative','HR Specialist','Financial Analyst',
    'Operations Coordinator','Support Agent','UI/UX Designer','Product Manager','Legal Counsel'
  ] AS v
),
clock_in_times AS (
  SELECT ARRAY['8:45 AM','8:52 AM','9:00 AM','9:05 AM','9:12 AM','9:15 AM','9:18 AM','9:20 AM','9:23 AM','9:30 AM'] AS v
),
clock_out_times AS (
  SELECT ARRAY['5:30 PM','5:45 PM','6:00 PM','6:15 PM','6:30 PM'] AS v
),
work_durations AS (
  SELECT ARRAY[525,533,540,550,558,555] AS v
),
nationalities AS (
  SELECT ARRAY['American','British','Canadian','Australian','German','French','Japanese','Indian','Brazilian','Mexican'] AS v
),
marital_statuses AS (
  SELECT ARRAY['Single','Married','Single','Married','Divorced'] AS v
),
profile_pictures AS (
  SELECT ARRAY[
    'https://images.unsplash.com/photo-1655249481446-25d575f1c054?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBidXNpbmVzcyUyMHBlcnNvbiUyMHBvcnRyYWl0fGVufDF8fHx8MTc2MjQzMzI3NXww&ixlib=rb-4.1.0&q=80&w=1080',
    'https://images.unsplash.com/photo-1689600944138-da3b150d9cb8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjB3b21hbiUyMGhlYWRzaG90fGVufDF8fHx8MTc2MjM5Mzc0Mnww&ixlib=rb-4.1.0&q=80&w=1080',
    'https://images.unsplash.com/photo-1672685667592-0392f458f46f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBtYW4lMjBoZWFkc2hvdHxlbnwxfHx8fDE3NjI0NzUyNzZ8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'https://images.unsplash.com/photo-1629507208649-70919ca33793?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxidXNpbmVzcyUyMHByb2Zlc3Npb25hbCUyMHBvcnRyYWl0fGVufDF8fHx8MTc2MjM3NjkxOHww&ixlib=rb-4.1.0&q=80&w=1080',
    'https://images.unsplash.com/photo-1758599543120-4e462429a4d7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb3Jwb3JhdGUlMjBoZWFkc2hvdCUyMHdvbWFufGVufDF8fHx8MTc2MjQ3ODM0MHww&ixlib=rb-4.1.0&q=80&w=1080',
    'https://images.unsplash.com/photo-1568585105565-e372998a195d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb3Jwb3JhdGUlMjBoZWFkc2hvdCUyMG1hbnxlbnwxfHx8fDE3NjI0MzQ3Nzh8MA&ixlib=rb-4.1.0&q=80&w=1080'
  ] AS v
),
employee_rows AS (
  SELECT
    gs AS i,
    'emp-' || gs AS employee_id,
    'WFP2025' || LPAD(gs::TEXT, 2, '0') AS employee_code,
    (SELECT v[gs] FROM first_names) AS first_name,
    (SELECT v[gs] FROM last_names) AS last_name,
    (SELECT department_id FROM app.departments WHERE name = (SELECT v[((gs - 1) % 10) + 1] FROM departments)) AS department_id,
    (SELECT v[((gs - 1) % 10) + 1] FROM positions) AS position,
    CASE WHEN gs <= 20 THEN 'present'::app.attendance_status WHEN gs <= 25 THEN 'on-leave'::app.attendance_status ELSE 'absent'::app.attendance_status END AS attendance_status,
    CASE WHEN gs IN (28,29) THEN 'onboarding'::app.employment_status WHEN gs IN (26,27) THEN 'inactive'::app.employment_status ELSE 'active'::app.employment_status END AS employment_status,
    CASE WHEN ((gs - 1) % 5) = 0 THEN 'independent contractor'::app.employment_type ELSE 'full-time'::app.employment_type END AS employment_type,
    CASE WHEN gs <= 20 THEN (SELECT v[((gs - 1) % 10) + 1] FROM clock_in_times) END AS clock_in_text,
    CASE WHEN gs <= 10 THEN (SELECT v[((gs - 1) % 5) + 1] FROM clock_out_times) END AS clock_out_text,
    CASE WHEN gs BETWEEN 21 AND 25 THEN 480 WHEN gs <= 10 THEN (SELECT v[((gs - 1) % 6) + 1] FROM work_durations) END AS work_duration_minutes,
    CASE WHEN gs = 1 THEN 15 WHEN gs = 6 THEN 20 WHEN gs = 11 THEN 30 ELSE NULL END AS late_minutes,
    CASE WHEN gs = 3 THEN DATE '2022-10-19' WHEN gs = 4 THEN DATE '2021-10-19'
      ELSE make_date(
        2020 + (1 + (abs(('x' || substr(md5('join-year-' || gs), 1, 8))::bit(32)::int) % 4)),
        1 + (abs(('x' || substr(md5('join-month-' || gs), 1, 8))::bit(32)::int) % 9),
        1 + (abs(('x' || substr(md5('join-day-' || gs), 1, 8))::bit(32)::int) % 28)
      ) END AS join_date,
    CASE WHEN gs = 1 THEN DATE '1985-10-19' WHEN gs = 2 THEN DATE '1986-10-19'
      ELSE make_date(
        1970 + (gs % 20),
        1 + (abs(('x' || substr(md5('bday-month-' || gs), 1, 8))::bit(32)::int) % 12),
        1 + (abs(('x' || substr(md5('bday-day-' || gs), 1, 8))::bit(32)::int) % 28)
      ) END AS birthday,
    CASE WHEN (gs % 5) IN (1,3,0) THEN 'Male' WHEN (gs % 5) IN (2,4) THEN 'Female' END AS gender,
    (SELECT v[((gs - 1) % 10) + 1] FROM nationalities) AS nationality,
    (SELECT v[((gs - 1) % 5) + 1] FROM marital_statuses) AS marital_status,
    '123 Uso St., Toril, Davao City, 8000, Philippines'::TEXT AS address,
    CASE WHEN gs = 28 THEN DATE '2025-10-15' END AS invitation_sent_date,
    CASE WHEN gs = 29 THEN TRUE END AS password_changed,
    (SELECT v[((gs - 1) % 6) + 1] FROM profile_pictures) AS profile_picture_url,
    lower((SELECT v[gs] FROM first_names) || '.' || (SELECT v[gs] FROM last_names) || '@company.com')::CITEXT AS email,
    '+1 (555) ' || LPAD((100 + (abs(('x' || substr(md5('phone-a-' || gs), 1, 8))::bit(32)::int) % 900))::TEXT, 3, '0') || '-' ||
      LPAD((1000 + (abs(('x' || substr(md5('phone-b-' || gs), 1, 8))::bit(32)::int) % 9000))::TEXT, 4, '0') AS phone
  FROM generate_series(1, 30) gs
)
INSERT INTO app.employees (
  employee_id, employee_code, first_name, last_name, email, phone,
  department_id, position, attendance_status, employment_status, employment_type,
  clock_in_time, clock_out_time, work_duration_minutes, late_minutes,
  join_date, birthday, gender, nationality, marital_status, address,
  invitation_sent_date, password_changed, profile_picture_url
)
SELECT
  employee_id, employee_code, first_name, last_name, email, phone,
  department_id, position, attendance_status, employment_status, employment_type,
  clock_in_text, clock_out_text, work_duration_minutes, late_minutes,
  join_date, birthday, gender, nationality, marital_status, address,
  invitation_sent_date, password_changed, profile_picture_url
FROM employee_rows
ON CONFLICT (employee_id) DO UPDATE
SET
  employee_code = EXCLUDED.employee_code,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  department_id = EXCLUDED.department_id,
  position = EXCLUDED.position,
  attendance_status = EXCLUDED.attendance_status,
  employment_status = EXCLUDED.employment_status,
  employment_type = EXCLUDED.employment_type,
  clock_in_time = EXCLUDED.clock_in_time,
  clock_out_time = EXCLUDED.clock_out_time,
  work_duration_minutes = EXCLUDED.work_duration_minutes,
  late_minutes = EXCLUDED.late_minutes,
  join_date = EXCLUDED.join_date,
  birthday = EXCLUDED.birthday,
  gender = EXCLUDED.gender,
  nationality = EXCLUDED.nationality,
  marital_status = EXCLUDED.marital_status,
  address = EXCLUDED.address,
  invitation_sent_date = EXCLUDED.invitation_sent_date,
  password_changed = EXCLUDED.password_changed,
  profile_picture_url = EXCLUDED.profile_picture_url,
  updated_at = NOW();

INSERT INTO app.payroll_profiles (employee_id, salary, pag_ibig, phil_health, sss, tin)
SELECT
  e.employee_id,
  150000 + (abs(('x' || substr(md5('salary-' || e.employee_id), 1, 8))::bit(32)::int) % 20001),
  '202511111111',
  '202511111111',
  '202511111111',
  '202511111111'
FROM app.employees e
WHERE e.employee_id ~ '^emp-[0-9]+$'
ON CONFLICT (employee_id) DO UPDATE
SET
  salary = EXCLUDED.salary,
  pag_ibig = EXCLUDED.pag_ibig,
  phil_health = EXCLUDED.phil_health,
  sss = EXCLUDED.sss,
  tin = EXCLUDED.tin,
  updated_at = NOW();

INSERT INTO app.payroll_deductions (deduction_id, employee_id, deduction_name, amount)
SELECT
  'ded-' || (SUBSTRING(e.employee_id FROM 5)::INT - 1) || '-1',
  e.employee_id,
  'Withholding Tax',
  ROUND(pp.salary * 0.10, 2)
FROM app.payroll_profiles pp
JOIN app.employees e ON e.employee_id = pp.employee_id
WHERE e.employee_id ~ '^emp-[0-9]+$'
ON CONFLICT (deduction_id) DO UPDATE
SET
  employee_id = EXCLUDED.employee_id,
  deduction_name = EXCLUDED.deduction_name,
  amount = EXCLUDED.amount;

INSERT INTO app.payroll_deductions (deduction_id, employee_id, deduction_name, amount)
SELECT
  'ded-' || (SUBSTRING(e.employee_id FROM 5)::INT - 1) || '-2',
  e.employee_id,
  'Employee HDMF',
  (100 + (abs(('x' || substr(md5('hdmf-' || e.employee_id), 1, 8))::bit(32)::int) % 101))::NUMERIC
FROM app.employees e
WHERE e.employee_id ~ '^emp-[0-9]+$'
ON CONFLICT (deduction_id) DO UPDATE
SET
  employee_id = EXCLUDED.employee_id,
  deduction_name = EXCLUDED.deduction_name,
  amount = EXCLUDED.amount;

INSERT INTO app.payroll_deductions (deduction_id, employee_id, deduction_name, amount)
SELECT
  'ded-' || (SUBSTRING(e.employee_id FROM 5)::INT - 1) || '-3',
  e.employee_id,
  'Employee PhilHealth',
  (2100 + (abs(('x' || substr(md5('philhealth-' || e.employee_id), 1, 8))::bit(32)::int) % 901))::NUMERIC
FROM app.employees e
WHERE e.employee_id ~ '^emp-[0-9]+$'
ON CONFLICT (deduction_id) DO UPDATE
SET
  employee_id = EXCLUDED.employee_id,
  deduction_name = EXCLUDED.deduction_name,
  amount = EXCLUDED.amount;

INSERT INTO app.payroll_deductions (deduction_id, employee_id, deduction_name, amount)
SELECT
  'ded-' || (SUBSTRING(e.employee_id FROM 5)::INT - 1) || '-4',
  e.employee_id,
  'Employee Social Security',
  (2000 + (abs(('x' || substr(md5('sss-' || e.employee_id), 1, 8))::bit(32)::int) % 501))::NUMERIC
FROM app.employees e
WHERE e.employee_id ~ '^emp-[0-9]+$'
ON CONFLICT (deduction_id) DO UPDATE
SET
  employee_id = EXCLUDED.employee_id,
  deduction_name = EXCLUDED.deduction_name,
  amount = EXCLUDED.amount;
