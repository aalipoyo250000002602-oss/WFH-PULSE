DELETE FROM app.holidays
WHERE country_code IN ('US', 'AU');

UPDATE app.holidays
SET
  country_code = 'PH',
  country_name = 'Philippines'
WHERE country_code IS DISTINCT FROM 'PH'
   OR country_name IS DISTINCT FROM 'Philippines';

DROP INDEX IF EXISTS uq_holidays_country_date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'holidays_holiday_date_key'
      AND conrelid = 'app.holidays'::regclass
  ) THEN
    ALTER TABLE app.holidays
      ADD CONSTRAINT holidays_holiday_date_key UNIQUE (holiday_date);
  END IF;
END $$;

ALTER TABLE app.holidays
  DROP COLUMN IF EXISTS country_name,
  DROP COLUMN IF EXISTS country_code;
