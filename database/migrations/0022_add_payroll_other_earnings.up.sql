CREATE TABLE IF NOT EXISTS app.payroll_other_earnings (
  earning_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES app.employees(employee_id) ON DELETE CASCADE,
  earning_name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_other_earnings_employee
  ON app.payroll_other_earnings (employee_id);

ALTER TABLE app.payroll_other_earnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payroll_other_earnings_select ON app.payroll_other_earnings;
CREATE POLICY payroll_other_earnings_select ON app.payroll_other_earnings
  FOR SELECT USING (
    app.is_hr_or_admin() OR employee_id = app.current_employee_id()
  );

DROP POLICY IF EXISTS payroll_other_earnings_write ON app.payroll_other_earnings;
CREATE POLICY payroll_other_earnings_write ON app.payroll_other_earnings
  FOR ALL USING (app.is_hr_or_admin())
  WITH CHECK (app.is_hr_or_admin());
