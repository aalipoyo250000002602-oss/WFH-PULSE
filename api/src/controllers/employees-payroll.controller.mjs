export function registerEmployeePayrollRoutes(app, deps) {
    const {
        withRlsContext,
        requireAuth,
        requireRole,
        hrPayrollUpdateSchema,
        resolveEmployeeId,
        getEmployeeRowForApi,
    } = deps

    app.put(
        '/employees/:employeeId/payroll',
        requireAuth,
        requireRole('admin', 'hr_manager'),
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
