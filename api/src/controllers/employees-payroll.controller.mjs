import { calculatePayrollReport } from '../services/payroll-report.service.mjs'
import { formatDateOnly } from '../services/date-only.service.mjs'

export function registerEmployeePayrollRoutes(app, deps) {
    const {
        withRlsContext,
        requireAuth,
        requireRole,
        hrPayrollUpdateSchema,
        resolveEmployeeId,
        getEmployeeRowForApi,
        syncAbsentAttendanceForRange,
    } = deps

    app.get(
        '/employees/:employeeId/payroll-report',
        requireAuth,
        requireRole('admin', 'hr_manager'),
        async (req, res) => {
            const employeeId = String(req.params.employeeId || '').trim()
            const from =
                typeof req.query.from === 'string' ? req.query.from : ''
            const to = typeof req.query.to === 'string' ? req.query.to : ''
            const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/

            if (!employeeId) {
                return res.status(400).json({ error: 'Invalid employeeId' })
            }
            if (!isoDateRegex.test(from) || !isoDateRegex.test(to)) {
                return res.status(400).json({
                    error: 'The from and to dates must use YYYY-MM-DD format',
                })
            }
            if (from > to) {
                return res.status(400).json({
                    error: 'The from date must be on or before to date',
                })
            }

            const inclusiveDays =
                Math.floor(
                    (Date.parse(`${to}T00:00:00Z`) -
                        Date.parse(`${from}T00:00:00Z`)) /
                        86400000
                ) + 1
            if (inclusiveDays > 90) {
                return res
                    .status(400)
                    .json({ error: 'Date range cannot exceed 90 days' })
            }

            try {
                const resolvedEmployeeId = await withRlsContext(
                    req.auth,
                    client => resolveEmployeeId(client, employeeId)
                )
                if (!resolvedEmployeeId) {
                    return res.status(404).json({ error: 'Employee not found' })
                }

                await syncAbsentAttendanceForRange(
                    req.auth,
                    resolvedEmployeeId,
                    from,
                    to
                )

                const report = await withRlsContext(req.auth, async client => {
                    const employeeResult = await client.query(
                        `
                        SELECT
                            e.employee_id,
                            e.employee_code,
                            e.first_name,
                            e.last_name,
                            e.email,
                            d.name AS department,
                            COALESCE(jp.name, e.position) AS position,
                            pp.salary,
                            pp.pag_ibig,
                            pp.phil_health,
                            pp.sss,
                            pp.tin
                        FROM app.employees e
                        LEFT JOIN app.departments d ON d.department_id = e.department_id
                        LEFT JOIN app.job_positions jp ON jp.position_id = e.position_id
                        LEFT JOIN app.payroll_profiles pp ON pp.employee_id = e.employee_id
                        WHERE e.employee_id = $1::text
                        LIMIT 1
                        `,
                        [resolvedEmployeeId]
                    )
                    const employee = employeeResult.rows[0]
                    if (!employee) {
                        return null
                    }

                    const attendanceResult = await client.query(
                        `
                        WITH actual_rows AS (
                            SELECT *
                            FROM app.attendance_records
                            WHERE employee_id = $1::text
                              AND attendance_date BETWEEN $2::date AND $3::date
                              AND record_type = 'actual'::app.attendance_record_type
                        ),
                        adjusted_rows AS (
                            SELECT *
                            FROM app.attendance_records
                            WHERE employee_id = $1::text
                              AND attendance_date BETWEEN $2::date AND $3::date
                              AND record_type = 'adjusted'::app.attendance_record_type
                              AND approval_status = 'approved'::app.request_status
                        ),
                        overtime_rows AS (
                            SELECT *
                            FROM app.attendance_records
                            WHERE employee_id = $1::text
                              AND attendance_date BETWEEN $2::date AND $3::date
                              AND record_type = 'overtime'::app.attendance_record_type
                              AND approval_status = 'approved'::app.request_status
                        ),
                        attendance_dates AS (
                            SELECT attendance_date FROM actual_rows
                            UNION
                            SELECT attendance_date FROM adjusted_rows
                            UNION
                            SELECT attendance_date FROM overtime_rows
                        )
                        SELECT
                            dates.attendance_date,
                            COALESCE(adjusted.status, actual.status, 'absent'::app.attendance_status) AS status,
                            COALESCE(adjusted.clock_in, actual.clock_in) AS clock_in,
                            COALESCE(adjusted.clock_out, actual.clock_out) AS clock_out,
                            (COALESCE(adjusted.work_duration_minutes, actual.work_duration_minutes, 0)
                                + COALESCE(overtime.work_duration_minutes, 0))::integer AS work_duration_minutes,
                            COALESCE(adjusted.late_minutes, actual.late_minutes, 0)::integer AS late_minutes
                        FROM attendance_dates dates
                        LEFT JOIN actual_rows actual USING (attendance_date)
                        LEFT JOIN adjusted_rows adjusted USING (attendance_date)
                        LEFT JOIN overtime_rows overtime USING (attendance_date)
                        ORDER BY dates.attendance_date
                        `,
                        [resolvedEmployeeId, from, to]
                    )
                    const deductionResult = await client.query(
                        `
                        SELECT deduction_id, deduction_name, amount
                        FROM app.payroll_deductions
                        WHERE employee_id = $1::text
                        ORDER BY deduction_id
                        `,
                        [resolvedEmployeeId]
                    )
                    const earningResult = await client.query(
                        `
                        SELECT earning_id, earning_name, amount
                        FROM app.payroll_other_earnings
                        WHERE employee_id = $1::text
                        ORDER BY earning_id
                        `,
                        [resolvedEmployeeId]
                    )

                    const records = attendanceResult.rows.map(row => ({
                        date: formatDateOnly(row.attendance_date),
                        status: row.status,
                        clockInTime: row.clock_in
                            ? String(row.clock_in).slice(0, 5)
                            : null,
                        clockOutTime: row.clock_out
                            ? String(row.clock_out).slice(0, 5)
                            : null,
                        workDurationMinutes: Number(
                            row.work_duration_minutes ?? 0
                        ),
                        lateMinutes: Number(row.late_minutes ?? 0),
                    }))
                    const deductions = deductionResult.rows.map(row => ({
                        id: row.deduction_id,
                        name: row.deduction_name,
                        amount: Number(row.amount ?? 0),
                    }))
                    const otherEarnings = earningResult.rows.map(row => ({
                        id: row.earning_id,
                        name: row.earning_name,
                        amount: Number(row.amount ?? 0),
                    }))
                    const totals = calculatePayrollReport({
                        salary: employee.salary,
                        deductions,
                        otherEarnings,
                        records,
                    })

                    return {
                        employee: {
                            employeeId: employee.employee_id,
                            employeeCode: employee.employee_code,
                            firstName: employee.first_name,
                            lastName: employee.last_name,
                            email: employee.email,
                            department: employee.department,
                            position: employee.position,
                            governmentIds: {
                                pagIbig: employee.pag_ibig ?? '',
                                philHealth: employee.phil_health ?? '',
                                sss: employee.sss ?? '',
                                tin: employee.tin ?? '',
                            },
                        },
                        period: { from, to },
                        records,
                        ...totals,
                    }
                })

                if (!report) {
                    return res.status(404).json({ error: 'Employee not found' })
                }
                return res.json(report)
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.put(
        '/employees/:employeeId/payroll',
        requireAuth,
        requireRole('admin'),
        async (req, res) => {
            const parsed = hrPayrollUpdateSchema.safeParse(req.body)
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.flatten() })
            }

            const payload = parsed.data
            const employeeId = String(req.params.employeeId || '').trim()
            if (!employeeId) {
                return res.status(400).json({ error: 'Invalid employeeId' })
            }

            try {
                const employee = await withRlsContext(
                    req.auth,
                    async client => {
                        const resolvedEmployeeId = await resolveEmployeeId(
                            client,
                            employeeId
                        )
                        if (!resolvedEmployeeId) {
                            return null
                        }

                        const employeeExists = await client.query(
                            `
          SELECT employee_id
          FROM app.employees
          WHERE employee_id = $1::text
          `,
                            [resolvedEmployeeId]
                        )

                        if (employeeExists.rowCount === 0) {
                            return null
                        }

                        await client.query(
                            `
          INSERT INTO app.payroll_profiles (
            employee_id,
            salary,
            pag_ibig,
            phil_health,
            sss,
            tin
          )
          VALUES ($1::text, $2::numeric, $3::text, $4::text, $5::text, $6::text)
          ON CONFLICT (employee_id) DO UPDATE
          SET
            salary = EXCLUDED.salary,
            pag_ibig = EXCLUDED.pag_ibig,
            phil_health = EXCLUDED.phil_health,
            sss = EXCLUDED.sss,
            tin = EXCLUDED.tin,
            updated_at = NOW()
          `,
                            [
                                resolvedEmployeeId,
                                payload.salary,
                                payload.governmentIds.pagIbig,
                                payload.governmentIds.philHealth,
                                payload.governmentIds.sss,
                                payload.governmentIds.tin,
                            ]
                        )

                        await client.query(
                            `
          DELETE FROM app.payroll_deductions
          WHERE employee_id = $1::text
          `,
                            [resolvedEmployeeId]
                        )

                        for (
                            let index = 0;
                            index < payload.deductions.length;
                            index += 1
                        ) {
                            const deduction = payload.deductions[index]
                            const fallbackId = `ded-${resolvedEmployeeId}-${index + 1}-${Date.now()}`
                            const deductionId =
                                deduction.id && deduction.id.trim().length > 0
                                    ? deduction.id.trim()
                                    : fallbackId

                            await client.query(
                                `
            INSERT INTO app.payroll_deductions (
              deduction_id,
              employee_id,
              deduction_name,
              amount
            )
            VALUES ($1::text, $2::text, $3::text, $4::numeric)
            `,
                                [
                                    deductionId,
                                    resolvedEmployeeId,
                                    deduction.name,
                                    deduction.amount,
                                ]
                            )
                        }

                        await client.query(
                            `
          DELETE FROM app.payroll_other_earnings
          WHERE employee_id = $1::text
          `,
                            [resolvedEmployeeId]
                        )

                        for (
                            let index = 0;
                            index < payload.otherEarnings.length;
                            index += 1
                        ) {
                            const earning = payload.otherEarnings[index]
                            const fallbackId = `earning-${resolvedEmployeeId}-${index + 1}-${Date.now()}`
                            const earningId =
                                earning.id && earning.id.trim().length > 0
                                    ? earning.id.trim()
                                    : fallbackId

                            await client.query(
                                `
            INSERT INTO app.payroll_other_earnings (
              earning_id,
              employee_id,
              earning_name,
              amount
            )
            VALUES ($1::text, $2::text, $3::text, $4::numeric)
            `,
                                [
                                    earningId,
                                    resolvedEmployeeId,
                                    earning.name,
                                    earning.amount,
                                ]
                            )
                        }

                        return getEmployeeRowForApi(client, resolvedEmployeeId)
                    }
                )

                if (!employee) {
                    return res.status(404).json({ error: 'Employee not found' })
                }

                return res.json({ employee })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )
}
