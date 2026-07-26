-- WFH-PULSE PostgreSQL 18 seed data
-- Mirrors existing mocked data from pages/components.

BEGIN;

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
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO app.payroll_profiles (employee_id, salary, pag_ibig, phil_health, sss, tin)
SELECT
  e.employee_id,
  150000 + (abs(('x' || substr(md5('salary-' || e.employee_id), 1, 8))::bit(32)::int) % 20001),
  '202511111111',
  '202511111111',
  '202511111111',
  '202511111111'
FROM app.employees e
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO app.payroll_deductions (deduction_id, employee_id, deduction_name, amount)
SELECT
  'ded-' || (SUBSTRING(e.employee_id FROM 5)::INT - 1) || '-1',
  e.employee_id,
  'Withholding Tax',
  ROUND(pp.salary * 0.10, 2)
FROM app.payroll_profiles pp
JOIN app.employees e ON e.employee_id = pp.employee_id
ON CONFLICT (deduction_id) DO NOTHING;

INSERT INTO app.payroll_deductions (deduction_id, employee_id, deduction_name, amount)
SELECT
  'ded-' || (SUBSTRING(e.employee_id FROM 5)::INT - 1) || '-2',
  e.employee_id,
  'Employee HDMF',
  (100 + (abs(('x' || substr(md5('hdmf-' || e.employee_id), 1, 8))::bit(32)::int) % 101))::NUMERIC
FROM app.employees e
ON CONFLICT (deduction_id) DO NOTHING;

INSERT INTO app.payroll_deductions (deduction_id, employee_id, deduction_name, amount)
SELECT
  'ded-' || (SUBSTRING(e.employee_id FROM 5)::INT - 1) || '-3',
  e.employee_id,
  'Employee PhilHealth',
  (2100 + (abs(('x' || substr(md5('philhealth-' || e.employee_id), 1, 8))::bit(32)::int) % 901))::NUMERIC
FROM app.employees e
ON CONFLICT (deduction_id) DO NOTHING;

INSERT INTO app.payroll_deductions (deduction_id, employee_id, deduction_name, amount)
SELECT
  'ded-' || (SUBSTRING(e.employee_id FROM 5)::INT - 1) || '-4',
  e.employee_id,
  'Employee Social Security',
  (2000 + (abs(('x' || substr(md5('sss-' || e.employee_id), 1, 8))::bit(32)::int) % 501))::NUMERIC
FROM app.employees e
ON CONFLICT (deduction_id) DO NOTHING;

INSERT INTO app.holidays (holiday_id, name, holiday_date, holiday_type, days_until)
VALUES
  ('h1', 'Ninoy Aquino Day (Philippines)', DATE '2026-08-21', 'public', 31),
  ('h2', 'National Heroes Day (Philippines)', DATE '2026-08-31', 'public', 41),
  ('h3', 'Labor Day (USA)', DATE '2026-09-07', 'public', 48),
  ('h4', 'Columbus Day (USA)', DATE '2026-10-12', 'public', 83),
  ('h5', 'All Saints'' Day (Philippines)', DATE '2026-11-01', 'public', 103),
  ('h6', 'Veterans Day (USA)', DATE '2026-11-11', 'public', 113),
  ('h7', 'Thanksgiving Day (USA)', DATE '2026-11-26', 'public', 128),
  ('h8', 'Bonifacio Day (Philippines)', DATE '2026-11-30', 'public', 132),
  ('h9', 'Feast of the Immaculate Conception (Philippines)', DATE '2026-12-08', 'public', 140),
  ('h10', 'Christmas Eve', DATE '2026-12-24', 'public', 156),
  ('h11', 'Christmas Day', DATE '2026-12-25', 'public', 157),
  ('h12', 'Rizal Day (Philippines)', DATE '2026-12-30', 'public', 162),
  ('h13', 'New Year''s Eve', DATE '2026-12-31', 'public', 163),
  ('h14', 'New Year''s Day', DATE '2027-01-01', 'public', 164)
ON CONFLICT (holiday_id) DO NOTHING;

-- Attendance history for employee emp-1 (Home + Attendance Details datasets)
INSERT INTO app.attendance_records (employee_id, attendance_date, status, clock_in, clock_out, work_duration_minutes, late_minutes)
VALUES
  ('emp-1', DATE '2025-08-18', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-08-19', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-08-20', 'late', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-08-21', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-08-22', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-08-25', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-08-26', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-08-27', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-08-28', 'absent', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-08-29', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-09-01', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-09-02', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-09-03', 'absent', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-09-04', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-09-05', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-09-08', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-09-09', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-09-10', 'late', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-09-11', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-09-12', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-09-15', 'absent', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-09-16', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-09-17', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-09-18', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-09-19', 'late', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-09-22', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-09-23', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-09-24', 'absent', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-09-25', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-09-26', 'late', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-09-29', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-09-30', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-10-01', 'present', TIME '08:55', TIME '17:10', 495, 0),
  ('emp-1', DATE '2025-10-02', 'present', TIME '09:02', TIME '17:05', 483, 0),
  ('emp-1', DATE '2025-10-03', 'late', TIME '09:15', TIME '17:30', 495, 15),
  ('emp-1', DATE '2025-10-06', 'present', TIME '08:50', TIME '17:00', 490, 0),
  ('emp-1', DATE '2025-10-07', 'present', TIME '08:58', TIME '17:15', 497, 0),
  ('emp-1', DATE '2025-10-08', 'present', TIME '09:00', TIME '17:05', 485, 0),
  ('emp-1', DATE '2025-10-09', 'late', TIME '09:25', TIME '17:40', 495, 25),
  ('emp-1', DATE '2025-10-10', 'present', TIME '08:45', TIME '17:00', 495, 0),
  ('emp-1', DATE '2025-10-13', 'present', TIME '08:55', TIME '17:10', 495, 0),
  ('emp-1', DATE '2025-10-14', 'present', TIME '09:00', TIME '17:00', 480, 0),
  ('emp-1', DATE '2025-10-15', 'absent', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-10-16', 'on-leave', NULL, NULL, 480, 0),
  ('emp-1', DATE '2025-10-17', 'present', TIME '08:50', TIME '17:05', 495, 0),
  ('emp-1', DATE '2025-10-20', 'present', TIME '08:58', TIME '17:10', 492, 0),
  ('emp-1', DATE '2025-10-21', 'late', TIME '09:20', TIME '17:30', 490, 20),
  ('emp-1', DATE '2025-10-22', 'present', TIME '08:55', TIME '17:00', 485, 0),
  ('emp-1', DATE '2025-10-23', 'present', TIME '09:00', TIME '17:15', 495, 0),
  ('emp-1', DATE '2025-10-24', 'present', TIME '08:52', TIME '17:05', 493, 0),
  ('emp-1', DATE '2025-10-27', 'present', TIME '08:50', TIME '17:00', 490, 0),
  ('emp-1', DATE '2025-10-28', 'present', TIME '09:00', TIME '17:10', 490, 0),
  ('emp-1', DATE '2025-10-29', 'late', TIME '09:18', TIME '17:25', 487, 18),
  ('emp-1', DATE '2025-10-30', 'present', TIME '08:55', TIME '17:05', 490, 0),
  ('emp-1', DATE '2025-10-31', 'present', TIME '08:58', TIME '17:00', 482, 0),
  ('emp-1', DATE '2025-11-03', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-11-04', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-11-05', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-11-06', 'late', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-11-07', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-11-10', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-11-12', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-11-13', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-11-14', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-11-17', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-11-18', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-11-19', 'late', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-11-20', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-11-21', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-11-24', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-11-25', 'present', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2025-11-26', 'on-leave', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2026-06-01', 'present', TIME '08:52', TIME '17:05', 493, 0),
  ('emp-1', DATE '2026-06-02', 'present', TIME '09:00', TIME '17:10', 490, 0),
  ('emp-1', DATE '2026-06-03', 'present', TIME '08:48', TIME '17:00', 492, 0),
  ('emp-1', DATE '2026-06-04', 'present', TIME '08:55', TIME '17:05', 490, 0),
  ('emp-1', DATE '2026-06-05', 'late', TIME '09:20', TIME '17:30', 490, 20),
  ('emp-1', DATE '2026-06-08', 'present', TIME '08:50', TIME '17:00', 490, 0),
  ('emp-1', DATE '2026-06-09', 'present', TIME '09:05', TIME '17:15', 490, 0),
  ('emp-1', DATE '2026-06-10', 'present', TIME '08:55', TIME '17:05', 490, 0),
  ('emp-1', DATE '2026-06-11', 'absent', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2026-06-12', 'holiday', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2026-06-15', 'on-leave', NULL, NULL, 480, 0),
  ('emp-1', DATE '2026-06-16', 'present', TIME '09:00', TIME '17:00', 480, 0),
  ('emp-1', DATE '2026-06-17', 'present', TIME '08:52', TIME '17:10', 498, 0),
  ('emp-1', DATE '2026-06-18', 'present', TIME '09:00', TIME '17:05', 485, 0),
  ('emp-1', DATE '2026-06-19', 'late', TIME '09:35', TIME '18:00', 505, 35),
  ('emp-1', DATE '2026-06-22', 'present', TIME '08:50', TIME '17:00', 490, 0),
  ('emp-1', DATE '2026-06-23', 'present', TIME '08:58', TIME '17:15', 497, 0),
  ('emp-1', DATE '2026-06-24', 'present', TIME '09:00', TIME '17:00', 480, 0),
  ('emp-1', DATE '2026-06-25', 'present', TIME '08:55', TIME '17:05', 490, 0),
  ('emp-1', DATE '2026-06-26', 'present', TIME '08:50', TIME '17:00', 490, 0),
  ('emp-1', DATE '2026-06-29', 'present', TIME '09:02', TIME '17:10', 488, 0),
  ('emp-1', DATE '2026-06-30', 'present', TIME '08:55', TIME '17:05', 490, 0),
  ('emp-1', DATE '2026-07-01', 'present', TIME '08:55', TIME '17:05', 490, 0),
  ('emp-1', DATE '2026-07-02', 'present', TIME '09:00', TIME '17:10', 490, 0),
  ('emp-1', DATE '2026-07-03', 'present', TIME '08:48', TIME '17:00', 492, 0),
  ('emp-1', DATE '2026-07-06', 'present', TIME '08:55', TIME '17:05', 490, 0),
  ('emp-1', DATE '2026-07-07', 'late', TIME '09:15', TIME '17:30', 495, 15),
  ('emp-1', DATE '2026-07-08', 'present', TIME '08:50', TIME '17:00', 490, 0),
  ('emp-1', DATE '2026-07-09', 'present', TIME '09:05', TIME '17:15', 490, 0),
  ('emp-1', DATE '2026-07-10', 'present', TIME '08:55', TIME '17:05', 490, 0),
  ('emp-1', DATE '2026-07-13', 'present', TIME '09:00', TIME '17:00', 480, 0),
  ('emp-1', DATE '2026-07-14', 'on-leave', NULL, NULL, 480, 0),
  ('emp-1', DATE '2026-07-15', 'absent', NULL, NULL, NULL, 0),
  ('emp-1', DATE '2026-07-16', 'present', TIME '08:52', TIME '17:10', 498, 0),
  ('emp-1', DATE '2026-07-17', 'present', TIME '08:58', TIME '17:05', 487, 0),
  ('emp-1', DATE '2026-07-20', 'late', TIME '09:25', TIME '17:40', 495, 25),
  ('emp-1', DATE '2026-07-21', 'present', TIME '08:50', TIME '17:00', 490, 0)
ON CONFLICT (employee_id, attendance_date) DO NOTHING;

INSERT INTO app.attendance_leave_details (attendance_id, request_date, from_date, to_date, reason, approved_by, approved_at)
SELECT attendance_id, DATE '2025-10-10', DATE '2025-10-16', DATE '2025-10-16', 'Personal emergency - family matter', 'Sarah Johnson (HR)', TIMESTAMPTZ '2025-10-11 10:30:00'
FROM app.attendance_records
WHERE employee_id = 'emp-1' AND attendance_date = DATE '2025-10-16'
ON CONFLICT (attendance_id) DO NOTHING;

INSERT INTO app.attendance_leave_details (attendance_id, request_date, from_date, to_date, reason, approved_by, approved_at)
SELECT attendance_id, DATE '2026-06-10', DATE '2026-06-15', DATE '2026-06-15', 'Medical appointment', 'Sarah Johnson (HR)', TIMESTAMPTZ '2026-06-11 10:30:00'
FROM app.attendance_records
WHERE employee_id = 'emp-1' AND attendance_date = DATE '2026-06-15'
ON CONFLICT (attendance_id) DO NOTHING;

INSERT INTO app.attendance_leave_details (attendance_id, request_date, from_date, to_date, reason, approved_by, approved_at)
SELECT attendance_id, DATE '2026-07-09', DATE '2026-07-14', DATE '2026-07-14', 'Annual medical check-up', 'Sarah Johnson (HR)', TIMESTAMPTZ '2026-07-10 09:00:00'
FROM app.attendance_records
WHERE employee_id = 'emp-1' AND attendance_date = DATE '2026-07-14'
ON CONFLICT (attendance_id) DO NOTHING;

INSERT INTO app.attendance_leave_attachments (attendance_id, file_name)
SELECT ar.attendance_id, x.file_name
FROM app.attendance_records ar
JOIN (
  VALUES
    (DATE '2025-10-16', 'medical-certificate.pdf'),
    (DATE '2026-06-15', 'medical-certificate.pdf'),
    (DATE '2026-07-14', 'appointment-slip.pdf')
) AS x(attendance_date, file_name)
  ON x.attendance_date = ar.attendance_date
WHERE ar.employee_id = 'emp-1';

INSERT INTO app.attendance_adjustment_requests (
  request_id, employee_id, employee_name, position, department, request_date,
  shift_date_from, shift_date_to, clock_in_time, clock_out_time,
  reason, break_duration_minutes, total_work_duration_minutes, message,
  status, submitted_at, approved_by, approved_at, denied_reason, source_page
)
VALUES
  ('adj-001','emp-2','John Smith','Senior Developer','Engineering',DATE '2025-10-21',DATE '2025-10-21',DATE '2025-10-21','9:30 AM','6:15 PM','Forgot to Clock-in/Clock-out',60,480,'I forgot to clock in this morning as I went straight into a meeting. My actual arrival time was around 9:30 AM based on building security logs.','pending',TIMESTAMPTZ '2025-10-22 00:00:00',NULL,NULL,NULL,'dashboard'),
  ('adj-002','emp-7','Lisa Anderson','Support Agent','Customer Support',DATE '2025-10-23',DATE '2025-10-23',DATE '2025-10-23','8:45 AM','5:30 PM','Missing logs',45,480,'System error occurred and my attendance was not recorded. I have emails timestamped showing I was working during this period.','pending',TIMESTAMPTZ '2025-10-24 00:00:00',NULL,NULL,NULL,'dashboard'),
  ('adj-003','emp-4','Jennifer Lee','Marketing Manager','Marketing',DATE '2025-10-20',DATE '2025-10-20',DATE '2025-10-20','9:00 AM','6:00 PM','Forgot to Clock-in/Clock-out',60,480,'Had an emergency client call and rushed into the office forgetting to clock in. Can verify with calendar invite.','pending',TIMESTAMPTZ '2025-10-21 00:00:00',NULL,NULL,NULL,'dashboard'),
  ('adj-004','emp-9','Daniel Thompson','Product Manager','Product',DATE '2025-10-22',DATE '2025-10-22',DATE '2025-10-22','8:30 AM','5:45 PM','Missing logs',30,495,'Card reader malfunction prevented me from clocking in/out. Security desk can confirm my entry and exit times.','pending',TIMESTAMPTZ '2025-10-23 00:00:00',NULL,NULL,NULL,'dashboard'),
  ('adj-005','emp-11','Christopher Davis','Sales Representative','Sales',DATE '2025-10-24',DATE '2025-10-24',DATE '2025-10-24','9:15 AM','6:30 PM','Forgot to Clock-in/Clock-out',45,510,'Was attending a client meeting offsite in the morning and forgot to clock in when I arrived at the office afterward.','pending',TIMESTAMPTZ '2025-10-25 00:00:00',NULL,NULL,NULL,'dashboard'),
  ('adj-006','emp-3','James Wilson','Senior Developer','Engineering',DATE '2025-10-15',DATE '2025-10-15',DATE '2025-10-15','9:00 AM','6:00 PM','Forgot to Clock-in/Clock-out',60,480,'System glitch prevented clock-in. Verified by IT department.','approved',TIMESTAMPTZ '2025-10-16 00:00:00','Sarah Martinez',TIMESTAMPTZ '2025-10-17 00:00:00',NULL,'dashboard'),
  ('adj-007','emp-6','Karen Brown','Operations Coordinator','Operations',DATE '2025-10-14',DATE '2025-10-14',DATE '2025-10-14','8:45 AM','5:30 PM','Missing logs',45,480,'Power outage caused system to lose my attendance record.','approved',TIMESTAMPTZ '2025-10-15 00:00:00','Michael Chen',TIMESTAMPTZ '2025-10-16 00:00:00',NULL,'dashboard'),
  ('adj-008','emp-8','Emily Rodriguez','UI/UX Designer','Design',DATE '2025-10-13',DATE '2025-10-13',DATE '2025-10-13','9:00 AM','6:15 PM','Forgot to Clock-in/Clock-out',60,495,'Started working remotely in the morning and forgot to clock in when I came to office for afternoon meetings.','approved',TIMESTAMPTZ '2025-10-14 00:00:00','Sarah Martinez',TIMESTAMPTZ '2025-10-15 00:00:00',NULL,'dashboard'),
  ('adj-009','emp-10','Robert Martinez','Product Manager','Product',DATE '2025-10-10',DATE '2025-10-10',DATE '2025-10-10','8:30 AM','5:45 PM','Missing logs',30,495,'Attendance kiosk was offline. Multiple employees affected.','approved',TIMESTAMPTZ '2025-10-11 00:00:00','Michael Chen',TIMESTAMPTZ '2025-10-12 00:00:00',NULL,'dashboard'),
  ('adj-010','emp-12','David Kim','Sales Representative','Sales',DATE '2025-10-09',DATE '2025-10-09',DATE '2025-10-09','9:00 AM','6:00 PM','Forgot to Clock-in/Clock-out',60,480,'Forgot to clock out due to urgent client emergency.','approved',TIMESTAMPTZ '2025-10-10 00:00:00','Sarah Martinez',TIMESTAMPTZ '2025-10-11 00:00:00',NULL,'dashboard'),
  ('adj-011','emp-1','Sarah Johnson','Marketing Manager','Marketing',DATE '2025-10-07',DATE '2025-10-07',DATE '2025-10-07','10:00 AM','7:00 PM','Forgot to Clock-in/Clock-out',60,480,'Forgot to clock in.','denied',TIMESTAMPTZ '2025-10-08 00:00:00','Michael Chen',TIMESTAMPTZ '2025-10-09 00:00:00','No supporting documentation provided. Please provide evidence of your actual work hours.','dashboard'),
  ('adj-012','emp-5','Michael Chen','Financial Analyst','Finance',DATE '2025-10-06',DATE '2025-10-06',DATE '2025-10-06','11:00 AM','8:00 PM','Missing logs',60,480,'System error.','denied',TIMESTAMPTZ '2025-10-07 00:00:00','Sarah Martinez',TIMESTAMPTZ '2025-10-08 00:00:00','IT department confirmed no system errors on this date. Please provide accurate information.','dashboard'),
  ('adj-013','emp-13','Amanda White','HR Specialist','HR',DATE '2025-10-03',DATE '2025-10-03',DATE '2025-10-03','10:30 AM','7:30 PM','Forgot to Clock-in/Clock-out',60,480,'Was late and forgot to clock in.','denied',TIMESTAMPTZ '2025-10-04 00:00:00','Michael Chen',TIMESTAMPTZ '2025-10-05 00:00:00','Late arrival without prior approval. Attendance policy requires prior notification for late arrivals.','dashboard'),
  ('adj-014','emp-14','Brian Wilson','Data Analyst','Analytics',DATE '2025-09-30',DATE '2025-09-30',DATE '2025-09-30','9:30 AM','6:30 PM','Missing logs',60,480,'I think there was a system issue.','denied',TIMESTAMPTZ '2025-10-01 00:00:00','Sarah Martinez',TIMESTAMPTZ '2025-10-02 00:00:00','Request submitted too late. Adjustment requests must be made within 24 hours of the occurrence.','dashboard'),
  ('adj-015','emp-15','Jessica Taylor','HR Specialist','HR',DATE '2025-09-28',DATE '2025-09-28',DATE '2025-09-28','10:00 AM','7:00 PM','Forgot to Clock-in/Clock-out',60,480,'Forgot to clock in yesterday.','denied',TIMESTAMPTZ '2025-09-29 00:00:00','Michael Chen',TIMESTAMPTZ '2025-09-30 00:00:00','Security logs show arrival at 10:15 AM, not 10:00 AM as claimed. Please verify accurate times.','dashboard'),
  ('adj-016','emp-16','Nicole Adams','Graphic Designer','Design',DATE '2025-10-05',DATE '2025-10-05',DATE '2025-10-05','9:00 AM','6:00 PM','Forgot to Clock-in/Clock-out',60,480,'Forgot to clock in this morning.','cancelled',TIMESTAMPTZ '2025-10-06 00:00:00',NULL,NULL,NULL,'dashboard'),
  ('adj-017','emp-17','Thomas Garcia','DevOps Engineer','Engineering',DATE '2025-10-04',DATE '2025-10-04',DATE '2025-10-04','8:45 AM','5:45 PM','Missing logs',45,495,'System didn''t record my attendance.','cancelled',TIMESTAMPTZ '2025-10-05 00:00:00',NULL,NULL,NULL,'dashboard'),
  ('adj-018','emp-18','Rachel Moore','Content Writer','Marketing',DATE '2025-09-25',DATE '2025-09-25',DATE '2025-09-25','9:00 AM','6:00 PM','Forgot to Clock-in/Clock-out',60,480,'Forgot to clock out.','cancelled',TIMESTAMPTZ '2025-09-26 00:00:00',NULL,NULL,NULL,'dashboard'),
  ('adj-019','emp-19','Kevin Wright','QA Engineer','Engineering',DATE '2025-09-23',DATE '2025-09-23',DATE '2025-09-23','9:00 AM','6:00 PM','Missing logs',60,480,'Card reader issue.','cancelled',TIMESTAMPTZ '2025-09-24 00:00:00',NULL,NULL,NULL,'dashboard'),
  ('adj-020','emp-20','Samantha Hill','Business Analyst','Analytics',DATE '2025-09-20',DATE '2025-09-20',DATE '2025-09-20','9:15 AM','6:15 PM','Forgot to Clock-in/Clock-out',60,480,'Forgot to clock in due to early morning meeting.','cancelled',TIMESTAMPTZ '2025-09-21 00:00:00',NULL,NULL,NULL,'dashboard'),
  ('adj-jul-001','emp-3','James Wilson','Senior Developer','Engineering',DATE '2026-07-18',DATE '2026-07-18',DATE '2026-07-18','9:00 AM','6:00 PM','Forgot to Clock-in/Clock-out',60,480,'I went straight to a client demo in the morning and forgot to clock in. I arrived at the office at 9:00 AM after the demo.','pending',TIMESTAMPTZ '2026-07-18 00:00:00',NULL,NULL,NULL,'dashboard'),
  ('adj-jul-002','emp-6','Karen Brown','Operations Coordinator','Operations',DATE '2026-07-16',DATE '2026-07-16',DATE '2026-07-16','8:45 AM','5:30 PM','Missing logs',45,480,'The attendance kiosk near our floor was offline for maintenance. IT can confirm the downtime window.','pending',TIMESTAMPTZ '2026-07-17 00:00:00',NULL,NULL,NULL,'dashboard'),
  ('adj-jul-003','emp-9','Daniel Thompson','Product Manager','Product',DATE '2026-07-14',DATE '2026-07-14',DATE '2026-07-14','8:30 AM','5:45 PM','Forgot to Clock-in/Clock-out',30,495,'Had an all-hands meeting immediately at 8:30 AM and forgot to clock in beforehand. Calendar invite attached as proof.','pending',TIMESTAMPTZ '2026-07-15 00:00:00',NULL,NULL,NULL,'dashboard'),
  ('adj-jul-004','emp-14','Brian Wilson','Data Analyst','Analytics',DATE '2026-07-10',DATE '2026-07-10',DATE '2026-07-10','9:00 AM','6:00 PM','Missing logs',60,480,'System recorded duplicate entries and my actual clock-in was removed during the cleanup. IT ticket submitted.','pending',TIMESTAMPTZ '2026-07-11 00:00:00',NULL,NULL,NULL,'dashboard'),
  ('adj-jul-005','emp-21','Olivia Nguyen','HR Specialist','HR',DATE '2026-07-08',DATE '2026-07-08',DATE '2026-07-08','8:55 AM','5:55 PM','Forgot to Clock-in/Clock-out',60,480,'Forgot to clock out as I left during a fire drill and got caught up afterwards.','pending',TIMESTAMPTZ '2026-07-09 00:00:00',NULL,NULL,NULL,'dashboard'),
  ('adj-jun-001','emp-4','Jennifer Lee','Marketing Manager','Marketing',DATE '2026-06-25',DATE '2026-06-25',DATE '2026-06-25','9:00 AM','6:15 PM','Forgot to Clock-in/Clock-out',60,495,'Attended an offsite client workshop in the morning. Arrived at office at 9:00 AM after the workshop ended.','approved',TIMESTAMPTZ '2026-06-26 00:00:00','Sarah Martinez',TIMESTAMPTZ '2026-06-27 00:00:00',NULL,'dashboard'),
  ('adj-jun-002','emp-7','Lisa Anderson','Support Agent','Customer Support',DATE '2026-06-18',DATE '2026-06-18',DATE '2026-06-18','8:45 AM','5:30 PM','Missing logs',45,480,'System crash during the morning shift caused records to be lost. Network logs confirm I was active on internal tools.','approved',TIMESTAMPTZ '2026-06-19 00:00:00','Michael Chen',TIMESTAMPTZ '2026-06-20 00:00:00',NULL,'dashboard'),
  ('adj-jun-003','emp-12','David Kim','Sales Representative','Sales',DATE '2026-06-10',DATE '2026-06-10',DATE '2026-06-10','8:30 AM','6:00 PM','Forgot to Clock-in/Clock-out',60,510,'Was on a sales call at 8:30 AM and clocked in from my phone, but the mobile sync failed.','approved',TIMESTAMPTZ '2026-06-11 00:00:00','Sarah Martinez',TIMESTAMPTZ '2026-06-12 00:00:00',NULL,'dashboard'),
  ('adj-att-001','emp-1','Alex Ali','Human Resource Admin','Engineering',DATE '2025-10-15',DATE '2025-10-15',DATE '2025-10-15','09:00','17:00','Forgot to Clock-in/Clock-out',60,480,'I forgot to clock in this morning due to urgent meeting. I arrived at 9:00 AM and left at 5:00 PM.','approved',TIMESTAMPTZ '2025-10-15 18:30:00','Sarah Johnson (HR)',TIMESTAMPTZ '2025-10-16 09:15:00',NULL,'home'),
  ('adj-att-002','emp-1','Alex Ali','Human Resource Admin','Engineering',DATE '2025-10-22',DATE '2025-10-22',DATE '2025-10-22','08:30','17:30','Missing logs',60,540,'System malfunction prevented proper clock-in/out logging. I have email timestamps as proof.','pending',TIMESTAMPTZ '2025-10-22 17:45:00',NULL,NULL,NULL,'home')
ON CONFLICT (request_id) DO NOTHING;

INSERT INTO app.adjustment_request_attachments (request_id, file_name)
SELECT request_id, file_name
FROM (VALUES
  ('adj-001','security-log.pdf'),
  ('adj-002','email-screenshot.png'),
  ('adj-002','system-error-report.pdf'),
  ('adj-003','calendar-invite.pdf'),
  ('adj-004','security-confirmation.pdf'),
  ('adj-005','client-meeting-notes.pdf'),
  ('adj-006','it-ticket.pdf'),
  ('adj-007','power-outage-notice.pdf'),
  ('adj-008','meeting-schedule.pdf'),
  ('adj-009','kiosk-maintenance-report.pdf'),
  ('adj-010','client-emergency-email.pdf'),
  ('adj-jul-001','client-demo-invite.pdf'),
  ('adj-jul-002','it-maintenance-notice.pdf'),
  ('adj-jul-003','all-hands-calendar.pdf'),
  ('adj-jul-004','it-ticket-1234.pdf'),
  ('adj-jul-005','fire-drill-notice.pdf'),
  ('adj-jun-001','workshop-agenda.pdf'),
  ('adj-jun-002','network-activity-log.pdf'),
  ('adj-jun-003','call-log.pdf'),
  ('adj-019','card-issue.pdf'),
  ('adj-att-001','meeting-invite.pdf'),
  ('adj-att-002','email-timestamps.pdf')
) a(request_id, file_name)
WHERE EXISTS (SELECT 1 FROM app.attendance_adjustment_requests r WHERE r.request_id = a.request_id);

INSERT INTO app.adjustment_request_logs (request_id, status, logged_at, approved_by, reason)
SELECT request_id, status::app.request_status, logged_at, approved_by, reason
FROM (VALUES
  ('adj-001','pending',TIMESTAMPTZ '2025-10-22 00:00:00',NULL,NULL),
  ('adj-002','pending',TIMESTAMPTZ '2025-10-24 00:00:00',NULL,NULL),
  ('adj-003','pending',TIMESTAMPTZ '2025-10-21 00:00:00',NULL,NULL),
  ('adj-004','pending',TIMESTAMPTZ '2025-10-23 00:00:00',NULL,NULL),
  ('adj-005','pending',TIMESTAMPTZ '2025-10-25 00:00:00',NULL,NULL),
  ('adj-006','pending',TIMESTAMPTZ '2025-10-16 00:00:00',NULL,NULL),
  ('adj-006','approved',TIMESTAMPTZ '2025-10-17 00:00:00','Sarah Martinez',NULL),
  ('adj-007','pending',TIMESTAMPTZ '2025-10-15 00:00:00',NULL,NULL),
  ('adj-007','approved',TIMESTAMPTZ '2025-10-16 00:00:00','Michael Chen',NULL),
  ('adj-008','pending',TIMESTAMPTZ '2025-10-14 00:00:00',NULL,NULL),
  ('adj-008','approved',TIMESTAMPTZ '2025-10-15 00:00:00','Sarah Martinez',NULL),
  ('adj-009','pending',TIMESTAMPTZ '2025-10-11 00:00:00',NULL,NULL),
  ('adj-009','approved',TIMESTAMPTZ '2025-10-12 00:00:00','Michael Chen',NULL),
  ('adj-010','pending',TIMESTAMPTZ '2025-10-10 00:00:00',NULL,NULL),
  ('adj-010','approved',TIMESTAMPTZ '2025-10-11 00:00:00','Sarah Martinez',NULL),
  ('adj-011','pending',TIMESTAMPTZ '2025-10-08 00:00:00',NULL,NULL),
  ('adj-011','denied',TIMESTAMPTZ '2025-10-09 00:00:00','Michael Chen','No supporting documentation provided. Please provide evidence of your actual work hours.'),
  ('adj-012','pending',TIMESTAMPTZ '2025-10-07 00:00:00',NULL,NULL),
  ('adj-012','denied',TIMESTAMPTZ '2025-10-08 00:00:00','Sarah Martinez','IT department confirmed no system errors on this date. Please provide accurate information.'),
  ('adj-013','pending',TIMESTAMPTZ '2025-10-04 00:00:00',NULL,NULL),
  ('adj-013','denied',TIMESTAMPTZ '2025-10-05 00:00:00','Michael Chen','Late arrival without prior approval. Attendance policy requires prior notification for late arrivals.'),
  ('adj-014','pending',TIMESTAMPTZ '2025-10-01 00:00:00',NULL,NULL),
  ('adj-014','denied',TIMESTAMPTZ '2025-10-02 00:00:00','Sarah Martinez','Request submitted too late. Adjustment requests must be made within 24 hours of the occurrence.'),
  ('adj-015','pending',TIMESTAMPTZ '2025-09-29 00:00:00',NULL,NULL),
  ('adj-015','denied',TIMESTAMPTZ '2025-09-30 00:00:00','Michael Chen','Security logs show arrival at 10:15 AM, not 10:00 AM as claimed. Please verify accurate times.'),
  ('adj-016','pending',TIMESTAMPTZ '2025-10-06 00:00:00',NULL,NULL),
  ('adj-016','cancelled',TIMESTAMPTZ '2025-10-07 00:00:00',NULL,'Found original clock-in record - adjustment not needed'),
  ('adj-017','pending',TIMESTAMPTZ '2025-10-05 00:00:00',NULL,NULL),
  ('adj-017','approved',TIMESTAMPTZ '2025-10-06 00:00:00','Sarah Martinez',NULL),
  ('adj-017','cancelled',TIMESTAMPTZ '2025-10-07 00:00:00',NULL,'Duplicate request - already processed under different ticket'),
  ('adj-018','pending',TIMESTAMPTZ '2025-09-26 00:00:00',NULL,NULL),
  ('adj-018','cancelled',TIMESTAMPTZ '2025-09-27 00:00:00',NULL,'Employee withdrew request - times were incorrect'),
  ('adj-019','pending',TIMESTAMPTZ '2025-09-24 00:00:00',NULL,NULL),
  ('adj-019','approved',TIMESTAMPTZ '2025-09-25 00:00:00','Michael Chen',NULL),
  ('adj-019','cancelled',TIMESTAMPTZ '2025-09-26 00:00:00',NULL,'IT resolved the issue and recovered the original records'),
  ('adj-020','pending',TIMESTAMPTZ '2025-09-21 00:00:00',NULL,NULL),
  ('adj-020','cancelled',TIMESTAMPTZ '2025-09-22 00:00:00',NULL,'Request no longer needed - manager updated timesheet directly'),
  ('adj-jul-001','pending',TIMESTAMPTZ '2026-07-18 00:00:00',NULL,NULL),
  ('adj-jul-002','pending',TIMESTAMPTZ '2026-07-17 00:00:00',NULL,NULL),
  ('adj-jul-003','pending',TIMESTAMPTZ '2026-07-15 00:00:00',NULL,NULL),
  ('adj-jul-004','pending',TIMESTAMPTZ '2026-07-11 00:00:00',NULL,NULL),
  ('adj-jul-005','pending',TIMESTAMPTZ '2026-07-09 00:00:00',NULL,NULL),
  ('adj-jun-001','pending',TIMESTAMPTZ '2026-06-26 00:00:00',NULL,NULL),
  ('adj-jun-001','approved',TIMESTAMPTZ '2026-06-27 00:00:00','Sarah Martinez',NULL),
  ('adj-jun-002','pending',TIMESTAMPTZ '2026-06-19 00:00:00',NULL,NULL),
  ('adj-jun-002','approved',TIMESTAMPTZ '2026-06-20 00:00:00','Michael Chen',NULL),
  ('adj-jun-003','pending',TIMESTAMPTZ '2026-06-11 00:00:00',NULL,NULL),
  ('adj-jun-003','approved',TIMESTAMPTZ '2026-06-12 00:00:00','Sarah Martinez',NULL),
  ('adj-att-001','approved',TIMESTAMPTZ '2025-10-16 09:15:00','Sarah Johnson (HR)',NULL),
  ('adj-att-002','pending',TIMESTAMPTZ '2025-10-22 17:45:00',NULL,NULL)
) l(request_id, status, logged_at, approved_by, reason)
WHERE EXISTS (SELECT 1 FROM app.attendance_adjustment_requests r WHERE r.request_id = l.request_id);

INSERT INTO app.leave_types (leave_type_id, name, default_limit_days)
VALUES
  ('bereavement','Bereavement Leave',10),
  ('compensatory','Compensatory Time Off',10),
  ('emergency','Emergency Leave',10),
  ('paternity','Paternity Leave',10),
  ('sick','Sick Leave',10),
  ('solo-parent','Solo Parent Leave',10),
  ('vacation','Vacation Leave',10)
ON CONFLICT (leave_type_id) DO NOTHING;

INSERT INTO app.leave_balances (employee_id, leave_type_id, credits, accrued, limit_days)
VALUES
  ('emp-1','bereavement',5,5,10),
  ('emp-1','compensatory',3,3,10),
  ('emp-1','emergency',4,4,10),
  ('emp-1','paternity',5,5,10),
  ('emp-1','sick',3,2,10),
  ('emp-1','solo-parent',4,4,10),
  ('emp-1','vacation',5,5,10)
ON CONFLICT (employee_id, leave_type_id) DO NOTHING;

INSERT INTO app.leave_requests (
  request_id, employee_id, leave_type_id, leave_type_name, start_date, end_date,
  message, status, submitted_at, source_page
)
VALUES
  ('lr-001','emp-1','vacation','Vacation Leave',DATE '2025-10-20',DATE '2025-10-24','Family vacation to Hawaii','pending',TIMESTAMPTZ '2025-10-15 00:00:00','dashboard'),
  ('lr-002','emp-5','sick','Sick Leave',DATE '2025-10-18',DATE '2025-10-18','Medical appointment for regular checkup','pending',TIMESTAMPTZ '2025-10-16 00:00:00','dashboard'),
  ('lr-003','emp-8','emergency','Emergency Leave',DATE '2025-10-19',DATE '2025-10-21','Family emergency - urgent matter','pending',TIMESTAMPTZ '2025-10-17 00:00:00','dashboard'),
  ('lr-004','emp-12','paternity','Paternity Leave',DATE '2025-10-25',DATE '2025-10-30','Welcoming our new baby','pending',TIMESTAMPTZ '2025-10-14 00:00:00','dashboard'),
  ('lr-005','emp-15','compensatory','Compensatory Time Off',DATE '2025-10-22',DATE '2025-10-23','Overtime compensation for weekend work','pending',TIMESTAMPTZ '2025-10-16 00:00:00','dashboard'),
  ('lr-006','emp-3','vacation','Vacation Leave',DATE '2025-09-25',DATE '2025-09-29','Annual family reunion','approved',TIMESTAMPTZ '2025-09-10 00:00:00','dashboard'),
  ('lr-007','emp-7','sick','Sick Leave',DATE '2025-10-10',DATE '2025-10-12','Recovering from flu','approved',TIMESTAMPTZ '2025-10-09 00:00:00','dashboard'),
  ('lr-008','emp-10','bereavement','Bereavement Leave',DATE '2025-09-20',DATE '2025-09-22','Funeral arrangements for family member','approved',TIMESTAMPTZ '2025-09-18 00:00:00','dashboard'),
  ('lr-009','emp-4','vacation','Vacation Leave',DATE '2025-10-20',DATE '2025-10-27','Extended vacation trip','denied',TIMESTAMPTZ '2025-10-05 00:00:00','dashboard'),
  ('lr-010','emp-9','emergency','Emergency Leave',DATE '2025-09-15',DATE '2025-09-18','Personal matter','denied',TIMESTAMPTZ '2025-09-14 00:00:00','dashboard'),
  ('lr-011','emp-13','compensatory','Compensatory Time Off',DATE '2025-10-08',DATE '2025-10-09','Overtime compensation request','denied',TIMESTAMPTZ '2025-10-01 00:00:00','dashboard'),
  ('lr-012','emp-2','vacation','Vacation Leave',DATE '2025-10-15',DATE '2025-10-17','Short vacation trip','cancelled',TIMESTAMPTZ '2025-09-25 00:00:00','dashboard'),
  ('lr-013','emp-6','sick','Sick Leave',DATE '2025-09-30',DATE '2025-09-30','Medical appointment','cancelled',TIMESTAMPTZ '2025-09-20 00:00:00','dashboard'),
  ('lr-014','emp-11','emergency','Emergency Leave',DATE '2025-09-12',DATE '2025-09-13','Urgent personal matter','cancelled',TIMESTAMPTZ '2025-09-08 00:00:00','dashboard'),
  ('req1','emp-1','bereavement','Bereavement Leave',DATE '2025-09-15',DATE '2025-09-17','Family emergency','approved',TIMESTAMPTZ '2025-09-10 00:00:00','calendar'),
  ('req-cto-1','emp-1','compensatory','Compensatory Time Off',DATE '2026-07-28',DATE '2026-07-28','Using compensatory time off earned from overtime work during the June product launch.','pending',TIMESTAMPTZ '2026-07-21 00:00:00','calendar'),
  ('req2','emp-1','emergency','Emergency Leave',DATE '2025-08-20',DATE '2025-08-20','Medical emergency','denied',TIMESTAMPTZ '2025-08-18 00:00:00','calendar'),
  ('req-em-2','emp-1','emergency','Emergency Leave',DATE '2026-07-15',DATE '2026-07-15','Pipe burst at home - needed to wait for the repair crew. Unable to report to work.','approved',TIMESTAMPTZ '2026-07-15 00:00:00','calendar'),
  ('req-sl-1','emp-1','sick','Sick Leave',DATE '2026-06-11',DATE '2026-06-11','Flu symptoms - high fever and body aches. Doctor advised rest.','approved',TIMESTAMPTZ '2026-06-11 00:00:00','calendar'),
  ('req3','emp-1','vacation','Vacation Leave',DATE '2025-10-01',DATE '2025-10-05','Family vacation','approved',TIMESTAMPTZ '2025-09-15 00:00:00','calendar'),
  ('req-vl-2','emp-1','vacation','Vacation Leave',DATE '2026-07-14',DATE '2026-07-14','Annual medical check-up and personal errands.','approved',TIMESTAMPTZ '2026-07-09 00:00:00','calendar'),
  ('req-vl-3','emp-1','vacation','Vacation Leave',DATE '2026-08-04',DATE '2026-08-07','Summer vacation with family.','pending',TIMESTAMPTZ '2026-07-21 00:00:00','calendar')
ON CONFLICT (request_id) DO NOTHING;

INSERT INTO app.leave_request_attachments (request_id, file_name)
SELECT request_id, file_name
FROM (VALUES
  ('lr-001','flight-tickets.pdf'),
  ('lr-002','medical-certificate.pdf'),
  ('lr-004','birth-certificate.pdf'),
  ('lr-005','overtime-log.pdf'),
  ('lr-006','itinerary.pdf'),
  ('lr-007','medical-cert.pdf'),
  ('lr-008','death-certificate.pdf'),
  ('req1','certificate.pdf'),
  ('req-em-2','repair-receipt.pdf'),
  ('req-sl-1','medical-cert.pdf'),
  ('req3','itinerary.pdf'),
  ('req-vl-2','appointment-slip.pdf'),
  ('req-vl-3','travel-itinerary.pdf')
) x(request_id, file_name)
WHERE EXISTS (SELECT 1 FROM app.leave_requests lr WHERE lr.request_id = x.request_id);

INSERT INTO app.leave_request_logs (request_id, status, logged_at, approved_by, reason)
SELECT request_id, status::app.request_status, logged_at, approved_by, reason
FROM (VALUES
  ('lr-001','pending',TIMESTAMPTZ '2025-10-15 00:00:00',NULL,NULL),
  ('lr-002','pending',TIMESTAMPTZ '2025-10-16 00:00:00',NULL,NULL),
  ('lr-003','pending',TIMESTAMPTZ '2025-10-17 00:00:00',NULL,NULL),
  ('lr-004','pending',TIMESTAMPTZ '2025-10-14 00:00:00',NULL,NULL),
  ('lr-005','pending',TIMESTAMPTZ '2025-10-16 00:00:00',NULL,NULL),
  ('lr-006','pending',TIMESTAMPTZ '2025-09-10 00:00:00',NULL,NULL),
  ('lr-006','approved',TIMESTAMPTZ '2025-09-12 00:00:00','Sarah Martinez',NULL),
  ('lr-007','pending',TIMESTAMPTZ '2025-10-09 00:00:00',NULL,NULL),
  ('lr-007','approved',TIMESTAMPTZ '2025-10-09 00:00:00','Michael Chen',NULL),
  ('lr-008','pending',TIMESTAMPTZ '2025-09-18 00:00:00',NULL,NULL),
  ('lr-008','approved',TIMESTAMPTZ '2025-09-18 00:00:00','Sarah Martinez',NULL),
  ('lr-009','pending',TIMESTAMPTZ '2025-10-05 00:00:00',NULL,NULL),
  ('lr-009','denied',TIMESTAMPTZ '2025-10-07 00:00:00','Michael Chen','Insufficient leave credits. Only 5 days available, 8 days requested.'),
  ('lr-010','pending',TIMESTAMPTZ '2025-09-14 00:00:00',NULL,NULL),
  ('lr-010','denied',TIMESTAMPTZ '2025-09-14 00:00:00','Sarah Martinez','Emergency leave requires supporting documentation. Please provide necessary documents.'),
  ('lr-011','pending',TIMESTAMPTZ '2025-10-01 00:00:00',NULL,NULL),
  ('lr-011','denied',TIMESTAMPTZ '2025-10-02 00:00:00','Michael Chen','No overtime records found for the requested period. Please verify with your supervisor.'),
  ('lr-012','pending',TIMESTAMPTZ '2025-09-25 00:00:00',NULL,NULL),
  ('lr-012','approved',TIMESTAMPTZ '2025-09-26 00:00:00','Sarah Martinez',NULL),
  ('lr-012','cancelled',TIMESTAMPTZ '2025-10-10 00:00:00',NULL,'Plans changed - unable to proceed with leave'),
  ('lr-013','pending',TIMESTAMPTZ '2025-09-20 00:00:00',NULL,NULL),
  ('lr-013','cancelled',TIMESTAMPTZ '2025-09-28 00:00:00',NULL,'Appointment rescheduled to a later date'),
  ('lr-014','pending',TIMESTAMPTZ '2025-09-08 00:00:00',NULL,NULL),
  ('lr-014','approved',TIMESTAMPTZ '2025-09-09 00:00:00','Michael Chen',NULL),
  ('lr-014','cancelled',TIMESTAMPTZ '2025-09-11 00:00:00',NULL,'Matter resolved - no longer need leave'),
  ('req1','pending',TIMESTAMPTZ '2025-09-10 00:00:00',NULL,NULL),
  ('req1','approved',TIMESTAMPTZ '2025-09-11 00:00:00','Sarah Martinez',NULL),
  ('req-cto-1','pending',TIMESTAMPTZ '2026-07-21 00:00:00',NULL,NULL),
  ('req2','pending',TIMESTAMPTZ '2025-08-18 00:00:00',NULL,NULL),
  ('req2','denied',TIMESTAMPTZ '2025-08-19 00:00:00','Michael Chen',NULL),
  ('req-em-2','pending',TIMESTAMPTZ '2026-07-15 00:00:00',NULL,NULL),
  ('req-em-2','approved',TIMESTAMPTZ '2026-07-16 00:00:00','Sarah Martinez',NULL),
  ('req-sl-1','pending',TIMESTAMPTZ '2026-06-11 00:00:00',NULL,NULL),
  ('req-sl-1','approved',TIMESTAMPTZ '2026-06-11 00:00:00','Sarah Martinez',NULL),
  ('req3','pending',TIMESTAMPTZ '2025-09-15 00:00:00',NULL,NULL),
  ('req3','approved',TIMESTAMPTZ '2025-09-16 00:00:00','Sarah Martinez',NULL),
  ('req-vl-2','pending',TIMESTAMPTZ '2026-07-09 00:00:00',NULL,NULL),
  ('req-vl-2','approved',TIMESTAMPTZ '2026-07-10 00:00:00','Sarah Martinez',NULL),
  ('req-vl-3','pending',TIMESTAMPTZ '2026-07-21 00:00:00',NULL,NULL)
) l(request_id, status, logged_at, approved_by, reason)
WHERE EXISTS (SELECT 1 FROM app.leave_requests lr WHERE lr.request_id = l.request_id);

INSERT INTO auth.roles (role_name)
VALUES ('admin'), ('hr_manager'), ('employee')
ON CONFLICT (role_name) DO NOTHING;

INSERT INTO auth.users (employee_id, email, password_hash, is_active, biometric_enabled, dark_mode_enabled, location)
VALUES
  ('emp-1', 'Alex.Ali@uic.co', crypt('P@ssw0rd123!', gen_salt('bf', 10)), TRUE, TRUE, FALSE, 'Tech Hub Office, Floor 5'),
  ('emp-2', 'sarah.johnson@company.com', crypt('P@ssw0rd123!', gen_salt('bf', 10)), TRUE, FALSE, FALSE, NULL)
ON CONFLICT (email) DO NOTHING;

INSERT INTO auth.user_roles (user_id, role_id)
SELECT u.user_id, r.role_id
FROM auth.users u
JOIN auth.roles r ON r.role_name = 'admin'
WHERE u.email = 'Alex.Ali@uic.co'
ON CONFLICT DO NOTHING;

INSERT INTO auth.user_roles (user_id, role_id)
SELECT u.user_id, r.role_id
FROM auth.users u
JOIN auth.roles r ON r.role_name = 'employee'
WHERE u.email = 'sarah.johnson@company.com'
ON CONFLICT DO NOTHING;

INSERT INTO app.user_preferences (
  user_id, working_start, working_end,
  clock_in_reminder, clock_out_reminder, daily_report,
  biometric_login, biometric_clock_in_out
)
SELECT
  u.user_id,
  TIME '09:00',
  TIME '18:00',
  TRUE,
  TRUE,
  FALSE,
  TRUE,
  FALSE
FROM auth.users u
WHERE u.email = 'Alex.Ali@uic.co'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO app.user_working_days (user_id, iso_day, is_working_day)
SELECT u.user_id, d.iso_day, d.is_working_day
FROM auth.users u
CROSS JOIN (VALUES
  (1, TRUE),
  (2, TRUE),
  (3, TRUE),
  (4, TRUE),
  (5, TRUE),
  (6, FALSE),
  (7, FALSE)
) AS d(iso_day, is_working_day)
WHERE u.email = 'Alex.Ali@uic.co'
ON CONFLICT (user_id, iso_day) DO NOTHING;

INSERT INTO auth.password_activities (user_id, action, activity_at, platform, status)
SELECT u.user_id, x.action, x.activity_at, x.platform, x.status
FROM auth.users u
CROSS JOIN (VALUES
  ('Waive Password', TIMESTAMPTZ '2025-07-12 23:47:03', 'iOS | Philippines', 'Successful'),
  ('Waive Password', TIMESTAMPTZ '2025-04-13 15:39:12', 'iOS | Philippines', 'Successful'),
  ('Waive Password', TIMESTAMPTZ '2025-01-12 19:22:27', 'iOS | Philippines', 'Successful')
) AS x(action, activity_at, platform, status)
WHERE u.email = 'Alex.Ali@uic.co';

COMMIT;

