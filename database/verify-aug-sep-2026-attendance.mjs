import { Client } from 'pg'
import { getPostgresConfig } from './db.config.mjs'

const client = new Client(getPostgresConfig())
await client.connect()

try {
    const result = await client.query(`
        WITH per_employee AS (
          SELECT
            e.employee_id,
            COUNT(ar.attendance_id)::integer AS weekdays,
            COUNT(*) FILTER (
              WHERE ar.status = 'absent'::app.attendance_status
            )::integer AS absent_days,
            COUNT(*) FILTER (
              WHERE ar.status = 'late'::app.attendance_status
            )::integer AS late_days,
            COUNT(*) FILTER (
              WHERE ar.status = 'present'::app.attendance_status
            )::integer AS present_days
          FROM app.employees e
          LEFT JOIN app.attendance_records ar
            ON ar.employee_id = e.employee_id
           AND ar.record_type = 'actual'::app.attendance_record_type
           AND ar.attendance_date BETWEEN DATE '2026-08-13' AND DATE '2026-09-14'
           AND EXTRACT(ISODOW FROM ar.attendance_date) BETWEEN 1 AND 5
          GROUP BY e.employee_id
        )
        SELECT
          COUNT(*)::integer AS employees,
          MIN(weekdays)::integer AS min_weekdays,
          MAX(weekdays)::integer AS max_weekdays,
          MIN(absent_days)::integer AS min_absent,
          MAX(absent_days)::integer AS max_absent,
          MIN(late_days)::integer AS min_late,
          MAX(late_days)::integer AS max_late,
          MIN(present_days)::integer AS min_present,
          MAX(present_days)::integer AS max_present,
          COUNT(*) FILTER (
            WHERE weekdays <> 23
               OR absent_days <> 2
               OR late_days <> 2
               OR present_days <> 19
          )::integer AS violations,
          ARRAY_AGG(employee_id ORDER BY employee_id) FILTER (
            WHERE weekdays <> 23
               OR absent_days <> 2
               OR late_days <> 2
               OR present_days <> 19
          ) AS violating_employees
        FROM per_employee
    `)

    const summary = result.rows[0]
    console.log(JSON.stringify(summary, null, 2))

    if (Number(summary.violations) > 0) {
        throw new Error(
            'August-September 2026 attendance does not satisfy every employee distribution.'
        )
    }
} finally {
    await client.end()
}
