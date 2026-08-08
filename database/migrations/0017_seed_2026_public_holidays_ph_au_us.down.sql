WITH seeded_rows AS (
  SELECT *
  FROM (
    VALUES
      ('PH', DATE '2026-01-01'),
      ('PH', DATE '2026-02-17'),
      ('PH', DATE '2026-04-02'),
      ('PH', DATE '2026-04-03'),
      ('PH', DATE '2026-04-04'),
      ('PH', DATE '2026-04-09'),
      ('PH', DATE '2026-05-01'),
      ('PH', DATE '2026-06-12'),
      ('PH', DATE '2026-08-21'),
      ('PH', DATE '2026-08-31'),
      ('PH', DATE '2026-10-31'),
      ('PH', DATE '2026-11-01'),
      ('PH', DATE '2026-11-30'),
      ('PH', DATE '2026-12-08'),
      ('PH', DATE '2026-12-24'),
      ('PH', DATE '2026-12-25'),
      ('PH', DATE '2026-12-30'),
      ('PH', DATE '2026-12-31'),

      ('AU', DATE '2026-01-01'),
      ('AU', DATE '2026-01-26'),
      ('AU', DATE '2026-04-03'),
      ('AU', DATE '2026-04-06'),
      ('AU', DATE '2026-12-25'),
      ('AU', DATE '2026-12-28'),

      ('US', DATE '2026-01-01'),
      ('US', DATE '2026-01-19'),
      ('US', DATE '2026-02-16'),
      ('US', DATE '2026-05-25'),
      ('US', DATE '2026-06-19'),
      ('US', DATE '2026-07-03'),
      ('US', DATE '2026-09-07'),
      ('US', DATE '2026-10-12'),
      ('US', DATE '2026-11-11'),
      ('US', DATE '2026-11-26'),
      ('US', DATE '2026-12-25')
  ) AS t(country_code, holiday_date)
)
DELETE FROM app.holidays h
USING seeded_rows s
WHERE h.country_code = s.country_code
  AND h.holiday_date = s.holiday_date;
