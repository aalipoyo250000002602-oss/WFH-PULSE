WITH seeded_rows AS (
  SELECT *
  FROM (
    VALUES
      ('AU', 'AU-NSW', DATE '2026-10-05', 'Labour Day'),
      ('AU', 'AU-VIC', DATE '2026-09-25', 'Friday before AFL Grand Final'),
      ('AU', 'AU-WA', DATE '2026-09-28', 'King''s Birthday'),
      ('AU', 'AU-QLD', DATE '2026-10-05', 'King''s Birthday'),
      ('US', 'US-TX', DATE '2026-04-03', 'Good Friday'),
      ('US', 'US-HI', DATE '2026-04-03', 'Good Friday'),
      ('US', 'US-CA', DATE '2026-02-12', 'Lincoln''s Birthday'),
      ('US', 'US-MO', DATE '2026-05-08', 'Truman Day'),
      ('US', 'US-CA', DATE '2026-10-12', 'Indigenous Peoples'' Day'),
      ('US', 'US-AK', DATE '2026-10-12', 'Indigenous Peoples'' Day')
  ) AS t(country_code, subdivision_code, holiday_date, holiday_name)
)
DELETE FROM app.holiday_subdivision_holidays h
USING seeded_rows s
WHERE h.country_code = s.country_code
  AND h.subdivision_code = s.subdivision_code
  AND h.holiday_date = s.holiday_date
  AND h.name = s.holiday_name;

DROP POLICY IF EXISTS holiday_subdivision_holidays_write ON app.holiday_subdivision_holidays;
DROP POLICY IF EXISTS holiday_subdivision_holidays_select ON app.holiday_subdivision_holidays;

DROP TABLE IF EXISTS app.holiday_subdivision_holidays;
