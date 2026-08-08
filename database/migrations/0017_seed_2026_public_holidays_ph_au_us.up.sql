WITH holiday_seed AS (
  SELECT *
  FROM (
    VALUES
      ('PH', 'Philippines', DATE '2026-01-01', 'New Year''s Day'),
      ('PH', 'Philippines', DATE '2026-02-17', 'Chinese New Year'),
      ('PH', 'Philippines', DATE '2026-04-02', 'Maundy Thursday'),
      ('PH', 'Philippines', DATE '2026-04-03', 'Good Friday'),
      ('PH', 'Philippines', DATE '2026-04-04', 'Holy Saturday'),
      ('PH', 'Philippines', DATE '2026-04-09', 'Day of Valor'),
      ('PH', 'Philippines', DATE '2026-05-01', 'Labour Day'),
      ('PH', 'Philippines', DATE '2026-06-12', 'Independence Day'),
      ('PH', 'Philippines', DATE '2026-08-21', 'Ninoy Aquino Day'),
      ('PH', 'Philippines', DATE '2026-08-31', 'National Heroes Day'),
      ('PH', 'Philippines', DATE '2026-10-31', 'All Saints'' Day Eve'),
      ('PH', 'Philippines', DATE '2026-11-01', 'All Saints'' Day'),
      ('PH', 'Philippines', DATE '2026-11-30', 'Bonifacio Day'),
      ('PH', 'Philippines', DATE '2026-12-08', 'Feast of the Immaculate Conception of Mary'),
      ('PH', 'Philippines', DATE '2026-12-24', 'Christmas Eve'),
      ('PH', 'Philippines', DATE '2026-12-25', 'Christmas Day'),
      ('PH', 'Philippines', DATE '2026-12-30', 'Rizal Day'),
      ('PH', 'Philippines', DATE '2026-12-31', 'Last Day of The Year'),

      ('AU', 'Australia', DATE '2026-01-01', 'New Year''s Day'),
      ('AU', 'Australia', DATE '2026-01-26', 'Australia Day'),
      ('AU', 'Australia', DATE '2026-04-03', 'Good Friday'),
      ('AU', 'Australia', DATE '2026-04-06', 'Easter Monday'),
      ('AU', 'Australia', DATE '2026-12-25', 'Christmas Day'),
      ('AU', 'Australia', DATE '2026-12-28', 'St. Stephen''s Day'),

      ('US', 'United States', DATE '2026-01-01', 'New Year''s Day'),
      ('US', 'United States', DATE '2026-01-19', 'Martin Luther King, Jr. Day'),
      ('US', 'United States', DATE '2026-02-16', 'Presidents Day'),
      ('US', 'United States', DATE '2026-05-25', 'Memorial Day'),
      ('US', 'United States', DATE '2026-06-19', 'Juneteenth National Independence Day'),
      ('US', 'United States', DATE '2026-07-03', 'Independence Day'),
      ('US', 'United States', DATE '2026-09-07', 'Labour Day'),
      ('US', 'United States', DATE '2026-10-12', 'Columbus Day'),
      ('US', 'United States', DATE '2026-11-11', 'Veterans Day'),
      ('US', 'United States', DATE '2026-11-26', 'Thanksgiving Day'),
      ('US', 'United States', DATE '2026-12-25', 'Christmas Day')
  ) AS t(country_code, country_name, holiday_date, holiday_name)
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
    'seed-2026-'
    || hs.country_code
    || '-'
    || to_char(hs.holiday_date, 'YYYY-MM-DD')
    || '-'
    || regexp_replace(lower(hs.holiday_name), '[^a-z0-9]+', '-', 'g')
  ) AS holiday_id,
  hs.holiday_name,
  hs.holiday_date,
  hs.country_code,
  hs.country_name,
  'public'::app.holiday_type,
  NULL
FROM holiday_seed hs
ON CONFLICT (country_code, holiday_date) DO UPDATE
SET
  name = EXCLUDED.name,
  country_name = EXCLUDED.country_name,
  holiday_type = EXCLUDED.holiday_type,
  days_until = NULL;
