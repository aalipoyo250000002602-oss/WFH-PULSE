import { Client } from "pg";
import { getPostgresConfig } from "./db.config.mjs";

async function run() {
  const client = new Client(getPostgresConfig());
  await client.connect();

  try {
    const { rows } = await client.query(`
      WITH target_weekdays AS (
        SELECT day_value::date AS attendance_date
        FROM generate_series(
          MAKE_DATE(EXTRACT(YEAR FROM CURRENT_DATE)::INT, 10, 1),
          CURRENT_DATE,
          INTERVAL '1 day'
        ) AS generated(day_value)
        WHERE EXTRACT(ISODOW FROM day_value) BETWEEN 1 AND 5
      ),
      expected AS (
        SELECT
          (SELECT COUNT(*)::int FROM app.employees) AS employee_count,
          (SELECT COUNT(*)::int FROM target_weekdays) AS weekday_count
      ),
      missing AS (
        SELECT e.employee_id, tw.attendance_date
        FROM app.employees e
        CROSS JOIN target_weekdays tw
        EXCEPT
        SELECT ar.employee_id, ar.attendance_date
        FROM app.attendance_records ar
        WHERE ar.attendance_date BETWEEN MAKE_DATE(EXTRACT(YEAR FROM CURRENT_DATE)::INT, 10, 1) AND CURRENT_DATE
          AND EXTRACT(ISODOW FROM ar.attendance_date) BETWEEN 1 AND 5
          AND ar.record_type = 'actual'::app.attendance_record_type
          AND ar.status = 'present'::app.attendance_status
      )
      SELECT
        ex.employee_count,
        ex.weekday_count,
        (ex.employee_count * ex.weekday_count)::int AS expected_present_rows,
        (
          SELECT COUNT(*)::int
          FROM app.attendance_records ar
          WHERE ar.attendance_date BETWEEN MAKE_DATE(EXTRACT(YEAR FROM CURRENT_DATE)::INT, 10, 1) AND CURRENT_DATE
            AND EXTRACT(ISODOW FROM ar.attendance_date) BETWEEN 1 AND 5
            AND ar.record_type = 'actual'::app.attendance_record_type
            AND ar.status = 'present'::app.attendance_status
        ) AS actual_present_rows,
        (SELECT COUNT(*)::int FROM missing) AS missing_rows
      FROM expected ex
    `);

    console.log(JSON.stringify(rows[0], null, 2));
  } finally {
    await client.end().catch(() => {});
  }
}

run().catch((error) => {
  console.error("Failed to verify October-to-current attendance.");
  console.error(error.message);
  process.exitCode = 1;
});