UPDATE app.leave_types
SET default_limit_days = 10
WHERE leave_type_id IN (
  'bereavement',
  'compensatory',
  'emergency',
  'paternity',
  'sick',
  'solo-parent',
  'vacation'
);

UPDATE app.leave_balances
SET
  credits = 10,
  accrued = 10,
  limit_days = 10
WHERE leave_type_id IN (
  'bereavement',
  'compensatory',
  'emergency',
  'paternity',
  'sick',
  'solo-parent',
  'vacation'
);
