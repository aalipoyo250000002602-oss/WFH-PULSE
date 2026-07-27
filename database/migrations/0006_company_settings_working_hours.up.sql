CREATE TABLE IF NOT EXISTS app.company_settings_working_hours (
  working_hour_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  iso_day SMALLINT NOT NULL UNIQUE CHECK (iso_day BETWEEN 1 AND 7),
  day_name TEXT NOT NULL UNIQUE,
  is_working_day BOOLEAN NOT NULL DEFAULT TRUE,
  start_time TIME,
  end_time TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_settings_working_hours_day_name_chk CHECK (
    lower(day_name) = ANY (ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
  ),
  CONSTRAINT company_settings_working_hours_schedule_chk CHECK (
    (is_working_day = TRUE AND start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
    OR
    (is_working_day = FALSE AND start_time IS NULL AND end_time IS NULL)
  )
);

INSERT INTO app.company_settings_working_hours (
  iso_day,
  day_name,
  is_working_day,
  start_time,
  end_time
)
VALUES
  (1, 'monday', TRUE, TIME '09:00', TIME '18:00'),
  (2, 'tuesday', TRUE, TIME '09:00', TIME '18:00'),
  (3, 'wednesday', TRUE, TIME '09:00', TIME '18:00'),
  (4, 'thursday', TRUE, TIME '09:00', TIME '18:00'),
  (5, 'friday', TRUE, TIME '09:00', TIME '18:00'),
  (6, 'saturday', FALSE, NULL, NULL),
  (7, 'sunday', FALSE, NULL, NULL)
ON CONFLICT (iso_day) DO NOTHING;
