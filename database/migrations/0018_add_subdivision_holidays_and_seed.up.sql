CREATE TABLE IF NOT EXISTS app.holiday_subdivision_holidays (
  subdivision_holiday_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  holiday_date DATE NOT NULL,
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL,
  subdivision_code TEXT NOT NULL,
  subdivision_name TEXT NOT NULL,
  holiday_type app.holiday_type NOT NULL,
  days_until INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (country_code, subdivision_code, holiday_date, name)
);

CREATE INDEX IF NOT EXISTS idx_holiday_subdivision_holidays_date
  ON app.holiday_subdivision_holidays (holiday_date);

ALTER TABLE app.holiday_subdivision_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS holiday_subdivision_holidays_select ON app.holiday_subdivision_holidays;
CREATE POLICY holiday_subdivision_holidays_select ON app.holiday_subdivision_holidays
  FOR SELECT USING (true);

DROP POLICY IF EXISTS holiday_subdivision_holidays_write ON app.holiday_subdivision_holidays;
CREATE POLICY holiday_subdivision_holidays_write ON app.holiday_subdivision_holidays
  FOR ALL USING (app.is_hr_or_admin())
  WITH CHECK (app.is_hr_or_admin());

WITH subdivision_seed AS (
  SELECT *
  FROM (
    VALUES
      ('AU', 'Australia', 'AU-NSW', 'New South Wales', DATE '2026-10-05', 'Labour Day'),
      ('AU', 'Australia', 'AU-VIC', 'Victoria', DATE '2026-09-25', 'Friday before AFL Grand Final'),
      ('AU', 'Australia', 'AU-WA', 'Western Australia', DATE '2026-09-28', 'King''s Birthday'),
      ('AU', 'Australia', 'AU-QLD', 'Queensland', DATE '2026-10-05', 'King''s Birthday'),
      ('US', 'United States', 'US-TX', 'Texas', DATE '2026-04-03', 'Good Friday'),
      ('US', 'United States', 'US-HI', 'Hawaii', DATE '2026-04-03', 'Good Friday'),
      ('US', 'United States', 'US-CA', 'California', DATE '2026-02-12', 'Lincoln''s Birthday'),
      ('US', 'United States', 'US-MO', 'Missouri', DATE '2026-05-08', 'Truman Day'),
      ('US', 'United States', 'US-CA', 'California', DATE '2026-10-12', 'Indigenous Peoples'' Day'),
      ('US', 'United States', 'US-AK', 'Alaska', DATE '2026-10-12', 'Indigenous Peoples'' Day')
  ) AS t(country_code, country_name, subdivision_code, subdivision_name, holiday_date, holiday_name)
)
INSERT INTO app.holiday_subdivision_holidays (
  subdivision_holiday_id,
  name,
  holiday_date,
  country_code,
  country_name,
  subdivision_code,
  subdivision_name,
  holiday_type,
  days_until
)
SELECT
  lower(
    'seed-2026-subdiv-'
    || ss.country_code
    || '-'
    || ss.subdivision_code
    || '-'
    || to_char(ss.holiday_date, 'YYYY-MM-DD')
    || '-'
    || regexp_replace(lower(ss.holiday_name), '[^a-z0-9]+', '-', 'g')
  ) AS subdivision_holiday_id,
  ss.holiday_name,
  ss.holiday_date,
  ss.country_code,
  ss.country_name,
  ss.subdivision_code,
  ss.subdivision_name,
  'public'::app.holiday_type,
  NULL
FROM subdivision_seed ss
ON CONFLICT (country_code, subdivision_code, holiday_date, name) DO UPDATE
SET
  country_name = EXCLUDED.country_name,
  subdivision_name = EXCLUDED.subdivision_name,
  holiday_type = EXCLUDED.holiday_type,
  days_until = NULL,
  updated_at = NOW();
