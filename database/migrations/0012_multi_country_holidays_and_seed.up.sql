ALTER TABLE app.holidays
  ADD COLUMN IF NOT EXISTS country_code TEXT,
  ADD COLUMN IF NOT EXISTS country_name TEXT;

UPDATE app.holidays
SET
  country_code = COALESCE(NULLIF(country_code, ''), 'PH'),
  country_name = COALESCE(NULLIF(country_name, ''), 'Philippines');

ALTER TABLE app.holidays
  ALTER COLUMN country_code SET NOT NULL,
  ALTER COLUMN country_name SET NOT NULL,
  ALTER COLUMN country_code SET DEFAULT 'PH',
  ALTER COLUMN country_name SET DEFAULT 'Philippines';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'holidays_holiday_date_key'
      AND conrelid = 'app.holidays'::regclass
  ) THEN
    ALTER TABLE app.holidays DROP CONSTRAINT holidays_holiday_date_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_holidays_country_date
  ON app.holidays (country_code, holiday_date);

WITH year_ref AS (
  SELECT EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Manila'))::int AS target_year
), static_holidays AS (
  SELECT * FROM (
    VALUES
      ('US', 'United States', 'New Year''s Day', 'public', 1, 1),
      ('US', 'United States', 'Juneteenth National Independence Day', 'public', 6, 19),
      ('US', 'United States', 'Independence Day', 'public', 7, 4),
      ('US', 'United States', 'Veterans Day', 'public', 11, 11),
      ('US', 'United States', 'Christmas Day', 'public', 12, 25),
      ('PH', 'Philippines', 'New Year''s Day', 'public', 1, 1),
      ('PH', 'Philippines', 'Araw ng Kagitingan', 'public', 4, 9),
      ('PH', 'Philippines', 'Independence Day', 'public', 6, 12),
      ('PH', 'Philippines', 'Ninoy Aquino Day', 'public', 8, 21),
      ('PH', 'Philippines', 'Bonifacio Day', 'public', 11, 30),
      ('PH', 'Philippines', 'Christmas Day', 'public', 12, 25),
      ('PH', 'Philippines', 'Rizal Day', 'public', 12, 30),
      ('AU', 'Australia', 'New Year''s Day', 'public', 1, 1),
      ('AU', 'Australia', 'Australia Day', 'public', 1, 26),
      ('AU', 'Australia', 'ANZAC Day', 'public', 4, 25),
      ('AU', 'Australia', 'Christmas Day', 'public', 12, 25),
      ('AU', 'Australia', 'Boxing Day', 'public', 12, 26)
  ) AS t(country_code, country_name, holiday_name, holiday_type, month_num, day_num)
)
INSERT INTO app.holidays (
  holiday_id,
  name,
  holiday_date,
  country_code,
  country_name,
  holiday_type,
  days_until
)
SELECT
  lower(
    sh.country_code
    || '-' || yr.target_year::text
    || '-' || lpad(sh.month_num::text, 2, '0')
    || '-' || lpad(sh.day_num::text, 2, '0')
    || '-' || regexp_replace(lower(sh.holiday_name), '[^a-z0-9]+', '-', 'g')
  ) AS holiday_id,
  sh.holiday_name,
  make_date(yr.target_year, sh.month_num, sh.day_num) AS holiday_date,
  sh.country_code,
  sh.country_name,
  sh.holiday_type::app.holiday_type,
  NULL
FROM static_holidays sh
CROSS JOIN year_ref yr
ON CONFLICT (country_code, holiday_date) DO UPDATE
SET
  name = EXCLUDED.name,
  country_name = EXCLUDED.country_name,
  holiday_type = EXCLUDED.holiday_type;
