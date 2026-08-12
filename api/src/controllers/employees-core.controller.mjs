export function registerEmployeeCoreRoutes(app, deps) {
    const {
        query,
        withRlsContext,
        requireAuth,
        requireRole,
        attendanceTimeZone,
        hrEmployeeCreateSchema,
        hrEmployeeUpdateSchema,
        isEmailTakenByAnotherEmployee,
        getEmployeeRowForApi,
        resolveEmployeeId,
    } = deps

    const leaveRequestStatusOptions = new Set([
        'pending',
        'approved',
        'denied',
        'cancelled',
    ])
    const defaultLeaveCreditDays = 5
    const managedLeaveTypes = [
        {
            leaveTypeId: 'bereavement',
            name: 'Bereavement Leave',
        },
        {
            leaveTypeId: 'compensatory',
            name: 'Compensatory Time Off',
        },
        {
            leaveTypeId: 'emergency',
            name: 'Emergency Leave',
        },
        {
            leaveTypeId: 'paternity',
            name: 'Paternity Leave',
        },
        {
            leaveTypeId: 'sick',
            name: 'Sick Leave',
        },
        {
            leaveTypeId: 'solo-parent',
            name: 'Solo Parent Leave',
        },
        {
            leaveTypeId: 'vacation',
            name: 'Vacation Leave',
        },
    ]
    const managedLeaveTypeIds = managedLeaveTypes.map(
        leaveType => leaveType.leaveTypeId
    )

    const ensureManagedLeaveTypes = async client => {
        for (const leaveType of managedLeaveTypes) {
            await client.query(
                `
                INSERT INTO app.leave_types (leave_type_id, name, default_limit_days)
                VALUES ($1::text, $2::text, $3::integer)
                ON CONFLICT (leave_type_id) DO UPDATE
                SET
                    name = EXCLUDED.name,
                    default_limit_days = COALESCE(app.leave_types.default_limit_days, EXCLUDED.default_limit_days)
                `,
                [leaveType.leaveTypeId, leaveType.name, defaultLeaveCreditDays]
            )
        }
    }

    const ensureLeaveBalancesForEmployee = async (client, employeeId) => {
        await ensureManagedLeaveTypes(client)
        await client.query(
            `
            INSERT INTO app.leave_balances (
                employee_id,
                leave_type_id,
                credits,
                accrued,
                limit_days
            )
            SELECT
                $1::text,
                lt.leave_type_id,
                lt.default_limit_days,
                lt.default_limit_days,
                lt.default_limit_days
            FROM app.leave_types lt
            WHERE lt.leave_type_id = ANY($2::text[])
            ON CONFLICT (employee_id, leave_type_id) DO NOTHING
            `,
            [employeeId, managedLeaveTypeIds]
        )
    }

    const getLeaveCreditsForEmployee = async (client, employeeId) => {
        const result = await client.query(
            `
            SELECT
              lt.leave_type_id,
              lt.name,
              COALESCE(lb.credits, lt.default_limit_days)::integer AS credits,
              COALESCE(lb.accrued, lt.default_limit_days)::integer AS accrued,
              COALESCE(lb.limit_days, lt.default_limit_days)::integer AS limit_days,
              lt.default_limit_days::integer AS default_limit_days
            FROM app.leave_types lt
            LEFT JOIN app.leave_balances lb
              ON lb.leave_type_id = lt.leave_type_id
             AND lb.employee_id = $1::text
            WHERE lt.leave_type_id = ANY($2::text[])
            ORDER BY array_position($2::text[], lt.leave_type_id)
            `,
            [employeeId, managedLeaveTypeIds]
        )

        return result.rows.map(row => ({
            leaveTypeId: String(row.leave_type_id ?? ''),
            name: String(row.name ?? ''),
            credits: Number(row.credits ?? 0),
            accrued: Number(row.accrued ?? 0),
            limitDays: Number(row.limit_days ?? 0),
            defaultLimitDays: Number(
                row.default_limit_days ?? defaultLeaveCreditDays
            ),
        }))
    }

    const getLeaveDaysInclusive = (startDateValue, endDateValue) => {
        const startIso = String(startDateValue ?? '').slice(0, 10)
        const endIso = String(endDateValue ?? '').slice(0, 10)
        const start = new Date(`${startIso}T00:00:00Z`)
        const end = new Date(`${endIso}T00:00:00Z`)

        if (
            Number.isNaN(start.getTime()) ||
            Number.isNaN(end.getTime()) ||
            end < start
        ) {
            throw new Error('Invalid leave date range')
        }

        return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
    }

    const applyLeaveCreditsDelta = async (
        client,
        employeeId,
        leaveTypeId,
        daysDelta
    ) => {
        if (!Number.isFinite(daysDelta) || daysDelta === 0) {
            return
        }

        await client.query(
            `
            INSERT INTO app.leave_balances (
                employee_id,
                leave_type_id,
                credits,
                accrued,
                limit_days
            )
            SELECT
                $1::text,
                lt.leave_type_id,
                GREATEST(0, COALESCE(lt.default_limit_days, 0) + $3::integer),
                COALESCE(lt.default_limit_days, 0),
                COALESCE(lt.default_limit_days, 0)
            FROM app.leave_types lt
            WHERE lt.leave_type_id = $2::text
            ON CONFLICT (employee_id, leave_type_id) DO UPDATE
            SET
                credits = GREATEST(0, COALESCE(app.leave_balances.credits, 0) + $3::integer),
                accrued = COALESCE(app.leave_balances.accrued, EXCLUDED.accrued),
                limit_days = COALESCE(app.leave_balances.limit_days, EXCLUDED.limit_days)
            `,
            [employeeId, leaveTypeId, Math.trunc(daysDelta)]
        )
    }

    const resolveLeaveTypeIdForRequest = async (
        client,
        leaveTypeId,
        leaveTypeName
    ) => {
        const normalizedLeaveTypeId = String(leaveTypeId ?? '').trim()
        if (normalizedLeaveTypeId) {
            return normalizedLeaveTypeId
        }

        const normalizedLeaveTypeName = String(leaveTypeName ?? '').trim()
        if (!normalizedLeaveTypeName) {
            throw new Error('Leave type is missing for this request')
        }

        const leaveTypeResult = await client.query(
            `
            SELECT leave_type_id
            FROM app.leave_types
            WHERE lower(name) = lower($1::text)
            LIMIT 1
            `,
            [normalizedLeaveTypeName]
        )

        if (leaveTypeResult.rowCount === 0) {
            throw new Error('Leave type not found for this request')
        }

        return String(leaveTypeResult.rows[0].leave_type_id)
    }

    const getAdjustmentRequestByIdForHrApi = async (client, requestId) => {
        const result = await client.query(
            `
                        SELECT
                            r.request_id,
                            r.employee_id,
                            r.employee_name,
                            r.position,
                            r.department,
                            r.request_date::text AS request_date,
                            r.shift_date_from::text AS shift_date_from,
                            r.shift_date_to::text AS shift_date_to,
                            r.clock_in_time,
                            r.clock_out_time,
                            r.reason,
                            r.break_duration_minutes,
                            r.total_work_duration_minutes,
                            r.message,
                            r.status,
                            r.submitted_at,
                            r.approved_by,
                            r.approved_at,
                            r.denied_reason,
                            r.source_page,
                            COALESCE(a.items, '[]'::jsonb) AS attachments,
                            COALESCE(l.items, '[]'::jsonb) AS logs
                        FROM app.attendance_adjustment_requests r
                        LEFT JOIN LATERAL (
                            SELECT jsonb_agg(
                                jsonb_build_object(
                                    'attachmentId', att.attachment_id,
                                    'fileName', att.file_name
                                )
                                ORDER BY att.attachment_id
                            ) AS items
                            FROM app.adjustment_request_attachments att
                            WHERE att.request_id = r.request_id
                        ) a ON TRUE
                        LEFT JOIN LATERAL (
                            SELECT jsonb_agg(
                                jsonb_build_object(
                                    'logId', lg.log_id,
                                    'status', lg.status,
                                    'loggedAt', lg.logged_at,
                                    'approvedBy', lg.approved_by,
                                    'reason', lg.reason
                                )
                                ORDER BY lg.logged_at ASC, lg.log_id ASC
                            ) AS items
                            FROM app.adjustment_request_logs lg
                            WHERE lg.request_id = r.request_id
                        ) l ON TRUE
                        WHERE r.request_id = $1::text
                        LIMIT 1
                        `,
            [requestId]
        )

        return result.rows[0] ?? null
    }

    const getLeaveRequestByIdForHrApi = async (client, requestId) => {
        const result = await client.query(
            `
            SELECT
                lr.request_id,
                lr.employee_id,
                CASE
                    WHEN e.employee_id IS NULL THEN lr.employee_id
                    ELSE TRIM(CONCAT(COALESCE(e.first_name, ''), ' ', COALESCE(e.last_name, '')))
                END AS employee_name,
                COALESCE(jp.name, e.position, '') AS position,
                COALESCE(d.name, '') AS department,
                COALESCE(lr.leave_type_name, lt.name, '') AS leave_type_name,
                lr.leave_type_id,
                lr.start_date::text AS start_date,
                lr.end_date::text AS end_date,
                lr.message,
                lr.status,
                lr.submitted_at,
                lr.source_page,
                COALESCE(a.items, '[]'::jsonb) AS attachments,
                COALESCE(l.items, '[]'::jsonb) AS logs
            FROM app.leave_requests lr
            LEFT JOIN app.leave_types lt
                ON lt.leave_type_id = lr.leave_type_id
            LEFT JOIN app.employees e
                ON e.employee_id = lr.employee_id
            LEFT JOIN app.departments d
                ON d.department_id = e.department_id
            LEFT JOIN app.job_positions jp
                ON jp.position_id = e.position_id
            LEFT JOIN LATERAL (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'attachmentId', att.attachment_id,
                        'fileName', att.file_name
                    )
                    ORDER BY att.attachment_id
                ) AS items
                FROM app.leave_request_attachments att
                WHERE att.request_id = lr.request_id
            ) a ON TRUE
            LEFT JOIN LATERAL (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'logId', lg.log_id,
                        'status', lg.status,
                        'loggedAt', lg.logged_at,
                        'approvedBy', lg.approved_by,
                        'reason', lg.reason
                    )
                    ORDER BY lg.logged_at ASC, lg.log_id ASC
                ) AS items
                FROM app.leave_request_logs lg
                WHERE lg.request_id = lr.request_id
            ) l ON TRUE
            WHERE lr.request_id = $1::text
            LIMIT 1
            `,
            [requestId]
        )

        return result.rows[0] ?? null
    }

    const getHrActorName = auth =>
        auth?.role === 'admin' ? 'Admin' : 'HR Manager'

    app.get('/employees', requireAuth, async (req, res) => {
        const from = typeof req.query.from === 'string' ? req.query.from : null
        const to = typeof req.query.to === 'string' ? req.query.to : null
        const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/
        const todayInAttendanceTimeZone = new Intl.DateTimeFormat('en-CA', {
            timeZone: attendanceTimeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(new Date())

        if (from != null && !isoDateRegex.test(from)) {
            return res.status(400).json({ error: 'Invalid from date format' })
        }

        if (to != null && !isoDateRegex.test(to)) {
            return res.status(400).json({ error: 'Invalid to date format' })
        }

        if (from != null && to != null && from > to) {
            return res
                .status(400)
                .json({ error: 'The from date must be on or before to date' })
        }

        if (
            (from != null && from > todayInAttendanceTimeZone) ||
            (to != null && to > todayInAttendanceTimeZone)
        ) {
            return res
                .status(400)
                .json({ error: 'Future dates are not allowed' })
        }

        try {
            const rows = await withRlsContext(req.auth, async client => {
                // Auto-close stale open shifts at end-of-day so missed clock-outs are normalized.
                await client.query(
                    `
                    WITH local_now AS (
                        SELECT
                            (NOW() AT TIME ZONE $1::text)::date AS local_today
                    )
                    UPDATE app.attendance_records ar
                    SET
                        clock_out = '23:59'::time,
                        work_duration_minutes = 480,
                        status = CASE
                            WHEN COALESCE(ar.late_minutes, 0) >= 15
                                THEN 'late'::app.attendance_status
                            ELSE 'present'::app.attendance_status
                        END,
                        active_break_started_at = NULL
                    FROM local_now ln
                    WHERE ar.record_type = 'actual'::app.attendance_record_type
                        AND ar.clock_in IS NOT NULL
                        AND ar.clock_out IS NULL
                        AND ar.attendance_date < ln.local_today
                        AND ($2::date IS NULL OR ar.attendance_date >= $2::date)
                        AND ($3::date IS NULL OR ar.attendance_date <= $3::date)
                    `,
                    [attendanceTimeZone, from, to]
                )

                const result = await client.query(
                    `
          SELECT
            e.employee_id,
            e.employee_code,
            e.first_name,
            e.last_name,
            e.email,
            e.phone,
            d.name AS department,
            e.position_id,
            COALESCE(jp.name, e.position) AS position,
            CASE
              WHEN ta.status = 'absent'::app.attendance_status THEN 'absent'::app.attendance_status
              WHEN ta.status = 'on-leave'::app.attendance_status THEN 'on-leave'::app.attendance_status
              WHEN ta.status IN ('present'::app.attendance_status, 'late'::app.attendance_status)
                THEN 'present'::app.attendance_status
                            ELSE 'absent'::app.attendance_status
            END AS attendance_status,
            e.employment_status,
            e.employment_type,
            ta.clock_in,
            ta.clock_out,
            ta.attendance_date AS status_date,
            ta.work_duration_minutes,
            ta.late_minutes,
            ta.active_break_started_at,
            e.join_date,
            e.birthday,
            e.gender,
            e.nationality,
            e.marital_status,
            e.address,
            e.invitation_sent_date,
            e.password_changed,
            e.profile_picture_url,
            pp.salary,
            pp.sss,
            pp.tin,
            pp.phil_health,
            pp.pag_ibig,
            COALESCE(pd.items, '[]'::jsonb) AS payroll_deductions,
            COALESCE(pe.items, '[]'::jsonb) AS payroll_other_earnings
          FROM app.employees e
          LEFT JOIN app.departments d ON d.department_id = e.department_id
          LEFT JOIN app.job_positions jp ON jp.position_id = e.position_id
          LEFT JOIN LATERAL (
            SELECT
              ar.status,
              ar.attendance_date,
              ar.clock_in,
              ar.clock_out,
              ar.work_duration_minutes,
              ar.late_minutes,
              ar.active_break_started_at
            FROM app.attendance_records ar
            WHERE ar.employee_id = e.employee_id
                            AND (
                                (
                                    $2::date IS NULL
                                    AND $3::date IS NULL
                                    AND ar.attendance_date = (NOW() AT TIME ZONE $1::text)::date
                                )
                                OR (
                                    $2::date IS NOT NULL
                                    AND $3::date IS NOT NULL
                                    AND ar.attendance_date BETWEEN $2::date AND $3::date
                                )
                                OR (
                                    $2::date IS NOT NULL
                                    AND $3::date IS NULL
                                    AND ar.attendance_date >= $2::date
                                )
                                OR (
                                    $2::date IS NULL
                                    AND $3::date IS NOT NULL
                                    AND ar.attendance_date <= $3::date
                                )
                            )
              AND ar.record_type = 'actual'::app.attendance_record_type
                        ORDER BY ar.attendance_date DESC, ar.attendance_id DESC
            LIMIT 1
          ) ta ON TRUE
          LEFT JOIN app.payroll_profiles pp ON pp.employee_id = e.employee_id
          LEFT JOIN LATERAL (
            SELECT jsonb_agg(
              jsonb_build_object(
                'deduction_id', d2.deduction_id,
                'deduction_name', d2.deduction_name,
                'amount', d2.amount
              )
              ORDER BY d2.deduction_id
            ) AS items
            FROM app.payroll_deductions d2
            WHERE d2.employee_id = e.employee_id
          ) pd ON TRUE
                    LEFT JOIN LATERAL (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'earning_id', e2.earning_id,
                                'earning_name', e2.earning_name,
                                'amount', e2.amount
                            )
                            ORDER BY e2.earning_id
                        ) AS items
                        FROM app.payroll_other_earnings e2
                        WHERE e2.employee_id = e.employee_id
                    ) pe ON TRUE
          ORDER BY e.employee_code
          LIMIT 500
          `,
                    [attendanceTimeZone, from, to]
                )
                return result.rows
            })

            return res.json({ employees: rows })
        } catch (error) {
            return res.status(400).json({ error: error.message })
        }
    })

    app.post(
        '/employees',
        requireAuth,
        requireRole('admin', 'hr_manager'),
        async (req, res) => {
            const parsed = hrEmployeeCreateSchema.safeParse(req.body)
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.flatten() })
            }

            const payload = parsed.data

            try {
                const employee = await withRlsContext(
                    req.auth,
                    async client => {
                        if (payload.email != null) {
                            const taken = await isEmailTakenByAnotherEmployee(
                                client,
                                payload.email
                            )
                            if (taken) {
                                throw new Error(
                                    'Email is already assigned to another employee'
                                )
                            }
                        }

                        const nextResult = await client.query(
                            `
          SELECT COALESCE(
            MAX((SUBSTRING(LOWER(employee_id) FROM '^emp-([0-9]+)$'))::int),
            0
          ) + 1 AS next_id
          FROM app.employees
          `
                        )

                        const nextId = Number(nextResult.rows[0]?.next_id ?? 1)
                        const employeeId = `emp-${nextId}`
                        const employeeCode = `WFP${new Date().getFullYear()}${String(nextId).padStart(4, '0')}`

                        await client.query(
                            `
          INSERT INTO app.employees (
            employee_id,
            employee_code,
            first_name,
            last_name,
            email,
            phone,
            department_id,
            position,
            position_id,
            attendance_status,
            employment_status,
            employment_type,
            join_date,
            birthday,
            gender,
            nationality,
            marital_status,
            address,
            invitation_sent_date,
            password_changed,
            profile_picture_url
          )
          VALUES (
            $1::text,
            $2::text,
            $3::text,
            $4::text,
            $5::citext,
            $6::text,
            $7::bigint,
            $8::text,
            $9::bigint,
            'absent'::app.attendance_status,
            $10::app.employment_status,
            $11::app.employment_type,
            $12::date,
            $13::date,
            $14::text,
            $15::text,
            $16::text,
            $17::text,
            $18::date,
            $19::boolean,
            $20::text
          )
          `,
                            [
                                employeeId,
                                employeeCode,
                                payload.firstName,
                                payload.lastName,
                                payload.email ?? null,
                                payload.phone ?? null,
                                payload.departmentId ?? null,
                                payload.position ?? null,
                                payload.positionId ?? null,
                                payload.employmentStatus ?? 'onboarding',
                                payload.employmentType,
                                payload.joinDate ?? null,
                                payload.birthday ?? null,
                                payload.gender ?? null,
                                payload.nationality ?? null,
                                payload.maritalStatus ?? null,
                                payload.address ?? null,
                                payload.invitationSentDate ?? null,
                                payload.passwordChanged ?? false,
                                payload.profilePictureUrl ?? null,
                            ]
                        )

                        await client.query(
                            `
          INSERT INTO app.payroll_profiles (employee_id, salary, pag_ibig, phil_health, sss, tin)
          VALUES ($1::text, 0, '', '', '', '')
          ON CONFLICT (employee_id) DO NOTHING
          `,
                            [employeeId]
                        )

                        await ensureLeaveBalancesForEmployee(client, employeeId)

                        return getEmployeeRowForApi(client, employeeId)
                    }
                )

                return res.status(201).json({ employee })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.patch(
        '/employees/:employeeId',
        requireAuth,
        requireRole('admin', 'hr_manager'),
        async (req, res) => {
            const parsed = hrEmployeeUpdateSchema.safeParse(req.body)
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.flatten() })
            }

            const payload = parsed.data
            const employeeId = String(req.params.employeeId || '').trim()
            if (!employeeId) {
                return res.status(400).json({ error: 'Invalid employeeId' })
            }

            const fieldMap = {
                firstName: 'first_name',
                lastName: 'last_name',
                email: 'email',
                phone: 'phone',
                birthday: 'birthday',
                gender: 'gender',
                nationality: 'nationality',
                maritalStatus: 'marital_status',
                address: 'address',
                departmentId: 'department_id',
                employmentType: 'employment_type',
                position: 'position',
                positionId: 'position_id',
                employmentStatus: 'employment_status',
                joinDate: 'join_date',
                invitationSentDate: 'invitation_sent_date',
                passwordChanged: 'password_changed',
                profilePictureUrl: 'profile_picture_url',
            }

            const assignments = []
            const params = []
            for (const [jsonKey, dbColumn] of Object.entries(fieldMap)) {
                if (Object.prototype.hasOwnProperty.call(payload, jsonKey)) {
                    params.push(payload[jsonKey])
                    assignments.push(`${dbColumn} = $${params.length}`)
                }
            }

            if (assignments.length === 0) {
                return res.status(400).json({ error: 'No fields provided' })
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

                        if (
                            Object.prototype.hasOwnProperty.call(
                                payload,
                                'email'
                            ) &&
                            payload.email != null
                        ) {
                            const taken = await isEmailTakenByAnotherEmployee(
                                client,
                                payload.email,
                                resolvedEmployeeId
                            )
                            if (taken) {
                                throw new Error(
                                    'Email is already assigned to another employee'
                                )
                            }
                        }

                        const updateParams = [...params, resolvedEmployeeId]
                        const updateResult = await client.query(
                            `
          UPDATE app.employees
          SET ${assignments.join(', ')}, updated_at = NOW()
          WHERE employee_id = $${updateParams.length}::text
          RETURNING employee_id
          `,
                            updateParams
                        )

                        if (updateResult.rowCount === 0) {
                            return null
                        }

                        if (
                            Object.prototype.hasOwnProperty.call(
                                payload,
                                'positionId'
                            )
                        ) {
                            await client.query(
                                `
            UPDATE app.employees e
            SET position = jp.name
            FROM app.job_positions jp
            WHERE e.employee_id = $1::text
              AND jp.position_id = e.position_id
            `,
                                [resolvedEmployeeId]
                            )

                            if (payload.positionId === null) {
                                await client.query(
                                    `
              UPDATE app.employees
              SET position = NULL
              WHERE employee_id = $1::text
              `,
                                    [resolvedEmployeeId]
                                )
                            }
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

    app.get(
        '/employees/:employeeId/leave-credits',
        requireAuth,
        requireRole('admin', 'hr_manager'),
        async (req, res) => {
            const employeeId = String(req.params.employeeId || '').trim()
            if (!employeeId) {
                return res.status(400).json({ error: 'Invalid employeeId' })
            }

            try {
                const leaveCredits = await withRlsContext(
                    req.auth,
                    async client => {
                        const resolvedEmployeeId = await resolveEmployeeId(
                            client,
                            employeeId
                        )
                        if (!resolvedEmployeeId) {
                            return null
                        }

                        await ensureLeaveBalancesForEmployee(
                            client,
                            resolvedEmployeeId
                        )
                        return getLeaveCreditsForEmployee(
                            client,
                            resolvedEmployeeId
                        )
                    }
                )

                if (!leaveCredits) {
                    return res.status(404).json({ error: 'Employee not found' })
                }

                return res.json({ leaveCredits })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.put(
        '/employees/:employeeId/leave-credits',
        requireAuth,
        requireRole('admin'),
        async (req, res) => {
            const employeeId = String(req.params.employeeId || '').trim()
            if (!employeeId) {
                return res.status(400).json({ error: 'Invalid employeeId' })
            }

            const rows = Array.isArray(req.body?.leaveCredits)
                ? req.body.leaveCredits
                : []
            if (rows.length === 0) {
                return res.status(400).json({
                    error: 'leaveCredits must be a non-empty array',
                })
            }

            const normalized = []
            const seen = new Set()
            for (const row of rows) {
                const leaveTypeId = String(row?.leaveTypeId ?? '').trim()
                const credits = Number(row?.credits)

                if (!managedLeaveTypeIds.includes(leaveTypeId)) {
                    return res.status(400).json({
                        error: `Unsupported leaveTypeId: ${leaveTypeId || '(empty)'}`,
                    })
                }

                if (!Number.isInteger(credits) || credits < 0) {
                    return res.status(400).json({
                        error: `credits for ${leaveTypeId} must be a non-negative integer`,
                    })
                }

                if (seen.has(leaveTypeId)) {
                    return res.status(400).json({
                        error: `Duplicate leaveTypeId: ${leaveTypeId}`,
                    })
                }

                seen.add(leaveTypeId)
                normalized.push({ leaveTypeId, credits })
            }

            try {
                const leaveCredits = await withRlsContext(
                    req.auth,
                    async client => {
                        const resolvedEmployeeId = await resolveEmployeeId(
                            client,
                            employeeId
                        )
                        if (!resolvedEmployeeId) {
                            return null
                        }

                        await ensureLeaveBalancesForEmployee(
                            client,
                            resolvedEmployeeId
                        )

                        for (const row of normalized) {
                            await client.query(
                                `
                                INSERT INTO app.leave_balances (
                                    employee_id,
                                    leave_type_id,
                                    credits,
                                    accrued,
                                    limit_days
                                )
                                VALUES ($1::text, $2::text, $3::integer, $3::integer, $3::integer)
                                ON CONFLICT (employee_id, leave_type_id) DO UPDATE
                                SET credits = EXCLUDED.credits
                                `,
                                [
                                    resolvedEmployeeId,
                                    row.leaveTypeId,
                                    row.credits,
                                ]
                            )
                        }

                        return getLeaveCreditsForEmployee(
                            client,
                            resolvedEmployeeId
                        )
                    }
                )

                if (!leaveCredits) {
                    return res.status(404).json({ error: 'Employee not found' })
                }

                return res.json({ leaveCredits })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.get(
        '/hr/leave-requests',
        requireAuth,
        requireRole('admin', 'hr_manager'),
        async (req, res) => {
            const status =
                typeof req.query.status === 'string'
                    ? req.query.status.trim().toLowerCase()
                    : null
            const sourcePage =
                typeof req.query.sourcePage === 'string'
                    ? req.query.sourcePage.trim().toLowerCase()
                    : 'all'

            if (status && !leaveRequestStatusOptions.has(status)) {
                return res.status(400).json({
                    error: 'Invalid status filter. Use pending, approved, denied, or cancelled.',
                })
            }

            if (
                sourcePage &&
                sourcePage !== 'all' &&
                sourcePage !== 'dashboard' &&
                sourcePage !== 'calendar' &&
                sourcePage !== 'home'
            ) {
                return res.status(400).json({
                    error: 'Invalid sourcePage filter. Use dashboard, calendar, home, or all.',
                })
            }

            try {
                const rows = await withRlsContext(req.auth, async client => {
                    const params = []
                    const where = []

                    if (status) {
                        params.push(status)
                        where.push(
                            `lr.status = $${params.length}::app.request_status`
                        )
                    }

                    if (sourcePage && sourcePage !== 'all') {
                        params.push(sourcePage)
                        where.push(`lr.source_page = $${params.length}::text`)
                    }

                    const filterSql =
                        where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

                    const result = await client.query(
                        `
                    SELECT
                        lr.request_id,
                        lr.employee_id,
                        CASE
                            WHEN e.employee_id IS NULL THEN lr.employee_id
                            ELSE TRIM(CONCAT(COALESCE(e.first_name, ''), ' ', COALESCE(e.last_name, '')))
                        END AS employee_name,
                        COALESCE(jp.name, e.position, '') AS position,
                        COALESCE(d.name, '') AS department,
                        COALESCE(lr.leave_type_name, lt.name, '') AS leave_type_name,
                        lr.leave_type_id,
                        lr.start_date::text AS start_date,
                        lr.end_date::text AS end_date,
                        lr.message,
                        lr.status,
                        lr.submitted_at,
                        lr.source_page,
                        COALESCE(a.items, '[]'::jsonb) AS attachments,
                        COALESCE(l.items, '[]'::jsonb) AS logs
                    FROM app.leave_requests lr
                    LEFT JOIN app.leave_types lt
                        ON lt.leave_type_id = lr.leave_type_id
                    LEFT JOIN app.employees e
                        ON e.employee_id = lr.employee_id
                    LEFT JOIN app.departments d
                        ON d.department_id = e.department_id
                    LEFT JOIN app.job_positions jp
                        ON jp.position_id = e.position_id
                    LEFT JOIN LATERAL (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'attachmentId', att.attachment_id,
                                'fileName', att.file_name
                            )
                            ORDER BY att.attachment_id
                        ) AS items
                        FROM app.leave_request_attachments att
                        WHERE att.request_id = lr.request_id
                    ) a ON TRUE
                    LEFT JOIN LATERAL (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'logId', lg.log_id,
                                'status', lg.status,
                                'loggedAt', lg.logged_at,
                                'approvedBy', lg.approved_by,
                                'reason', lg.reason
                            )
                            ORDER BY lg.logged_at ASC, lg.log_id ASC
                        ) AS items
                        FROM app.leave_request_logs lg
                        WHERE lg.request_id = lr.request_id
                    ) l ON TRUE
                    ${filterSql}
                    ORDER BY lr.submitted_at DESC, lr.request_id DESC
                    LIMIT 500
                    `,
                        params
                    )

                    return result.rows
                })

                return res.json({ requests: rows })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.get(
        '/hr/adjustment-requests',
        requireAuth,
        requireRole('admin', 'hr_manager'),
        async (req, res) => {
            const status =
                typeof req.query.status === 'string'
                    ? req.query.status.trim().toLowerCase()
                    : null
            const sourcePage =
                typeof req.query.sourcePage === 'string'
                    ? req.query.sourcePage.trim().toLowerCase()
                    : 'dashboard'

            if (status && !leaveRequestStatusOptions.has(status)) {
                return res.status(400).json({
                    error: 'Invalid status filter. Use pending, approved, denied, or cancelled.',
                })
            }

            if (
                sourcePage &&
                sourcePage !== 'all' &&
                sourcePage !== 'dashboard' &&
                sourcePage !== 'home' &&
                sourcePage !== 'home-overtime'
            ) {
                return res.status(400).json({
                    error: 'Invalid sourcePage filter. Use dashboard, home, home-overtime, or all.',
                })
            }

            try {
                const rows = await withRlsContext(req.auth, async client => {
                    const params = []
                    const where = []

                    if (status) {
                        params.push(status)
                        where.push(
                            `r.status = $${params.length}::app.request_status`
                        )
                    }

                    if (sourcePage && sourcePage !== 'all') {
                        params.push(sourcePage)
                        where.push(`r.source_page = $${params.length}::text`)
                    }

                    const filterSql =
                        where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

                    const result = await client.query(
                        `
                        SELECT
                          r.request_id,
                          r.employee_id,
                          r.employee_name,
                          r.position,
                          r.department,
                          r.request_date::text AS request_date,
                          r.shift_date_from::text AS shift_date_from,
                          r.shift_date_to::text AS shift_date_to,
                          r.clock_in_time,
                          r.clock_out_time,
                          r.reason,
                          r.break_duration_minutes,
                          r.total_work_duration_minutes,
                          r.message,
                          r.status,
                          r.submitted_at,
                          r.approved_by,
                          r.approved_at,
                          r.denied_reason,
                          r.source_page,
                          COALESCE(a.items, '[]'::jsonb) AS attachments,
                          COALESCE(l.items, '[]'::jsonb) AS logs
                        FROM app.attendance_adjustment_requests r
                        LEFT JOIN LATERAL (
                          SELECT jsonb_agg(
                            jsonb_build_object(
                              'attachmentId', att.attachment_id,
                              'fileName', att.file_name
                            )
                            ORDER BY att.attachment_id
                          ) AS items
                          FROM app.adjustment_request_attachments att
                          WHERE att.request_id = r.request_id
                        ) a ON TRUE
                        LEFT JOIN LATERAL (
                          SELECT jsonb_agg(
                            jsonb_build_object(
                              'logId', lg.log_id,
                              'status', lg.status,
                              'loggedAt', lg.logged_at,
                              'approvedBy', lg.approved_by,
                              'reason', lg.reason
                            )
                            ORDER BY lg.logged_at ASC, lg.log_id ASC
                          ) AS items
                          FROM app.adjustment_request_logs lg
                          WHERE lg.request_id = r.request_id
                        ) l ON TRUE
                        ${filterSql}
                        ORDER BY r.submitted_at DESC, r.request_id DESC
                        LIMIT 500
                        `,
                        params
                    )

                    return result.rows
                })

                return res.json({ requests: rows })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.post(
        '/hr/leave-requests/:requestId/approve',
        requireAuth,
        requireRole('admin', 'hr_manager'),
        async (req, res) => {
            const requestId = String(req.params.requestId || '').trim()
            if (!requestId) {
                return res.status(400).json({ error: 'Invalid requestId' })
            }

            try {
                const request = await withRlsContext(req.auth, async client => {
                    const existingResult = await client.query(
                        `
                        SELECT
                            request_id,
                            status,
                            employee_id,
                            leave_type_id,
                            leave_type_name,
                            start_date::text AS start_date,
                            end_date::text AS end_date
                        FROM app.leave_requests
                        WHERE request_id = $1::text
                        LIMIT 1
                        FOR UPDATE
                        `,
                        [requestId]
                    )

                    if (existingResult.rowCount === 0) {
                        throw new Error('Leave request not found')
                    }

                    const existing = existingResult.rows[0]
                    if (existing.status !== 'pending') {
                        throw new Error(
                            'Only pending leave requests can be approved'
                        )
                    }

                    const leaveDays = getLeaveDaysInclusive(
                        existing.start_date,
                        existing.end_date
                    )
                    const resolvedLeaveTypeId =
                        await resolveLeaveTypeIdForRequest(
                            client,
                            existing.leave_type_id,
                            existing.leave_type_name
                        )

                    const actorName = getHrActorName(req.auth)

                    await applyLeaveCreditsDelta(
                        client,
                        String(existing.employee_id),
                        resolvedLeaveTypeId,
                        -leaveDays
                    )

                    await client.query(
                        `
                        UPDATE app.leave_requests
                        SET status = 'approved'::app.request_status
                        WHERE request_id = $1::text
                        `,
                        [requestId]
                    )

                    await client.query(
                        `
                        INSERT INTO app.leave_request_logs (request_id, status, logged_at, approved_by, reason)
                        VALUES (
                          $1::text,
                          'approved'::app.request_status,
                          NOW(),
                          $2::text,
                          'Approved by HR'
                        )
                        `,
                        [requestId, actorName]
                    )

                    return getLeaveRequestByIdForHrApi(client, requestId)
                })

                return res.json({ request })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.post(
        '/hr/leave-requests/:requestId/deny',
        requireAuth,
        requireRole('admin', 'hr_manager'),
        async (req, res) => {
            const requestId = String(req.params.requestId || '').trim()
            if (!requestId) {
                return res.status(400).json({ error: 'Invalid requestId' })
            }

            const reason =
                typeof req.body?.reason === 'string'
                    ? req.body.reason.trim()
                    : ''
            if (reason.length < 3) {
                return res.status(400).json({
                    error: 'A denial reason with at least 3 characters is required.',
                })
            }

            try {
                const request = await withRlsContext(req.auth, async client => {
                    const existingResult = await client.query(
                        `
                        SELECT
                            request_id,
                            status,
                            employee_id,
                            leave_type_id,
                            start_date::text AS start_date,
                            end_date::text AS end_date
                        FROM app.leave_requests
                        WHERE request_id = $1::text
                        LIMIT 1
                        FOR UPDATE
                        `,
                        [requestId]
                    )

                    if (existingResult.rowCount === 0) {
                        throw new Error('Leave request not found')
                    }

                    const existing = existingResult.rows[0]
                    if (existing.status !== 'pending') {
                        throw new Error(
                            'Only pending leave requests can be denied'
                        )
                    }

                    const actorName = getHrActorName(req.auth)

                    await client.query(
                        `
                        UPDATE app.leave_requests
                        SET status = 'denied'::app.request_status
                        WHERE request_id = $1::text
                        `,
                        [requestId]
                    )

                    await client.query(
                        `
                        INSERT INTO app.leave_request_logs (request_id, status, logged_at, approved_by, reason)
                        VALUES (
                          $1::text,
                          'denied'::app.request_status,
                          NOW(),
                          $2::text,
                          $3::text
                        )
                        `,
                        [requestId, actorName, reason]
                    )

                    return getLeaveRequestByIdForHrApi(client, requestId)
                })

                return res.json({ request })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.post(
        '/hr/leave-requests/:requestId/cancel',
        requireAuth,
        requireRole('admin', 'hr_manager'),
        async (req, res) => {
            const requestId = String(req.params.requestId || '').trim()
            if (!requestId) {
                return res.status(400).json({ error: 'Invalid requestId' })
            }

            const reason =
                typeof req.body?.reason === 'string'
                    ? req.body.reason.trim()
                    : ''
            if (reason.length < 3) {
                return res.status(400).json({
                    error: 'A cancellation reason with at least 3 characters is required.',
                })
            }

            try {
                const request = await withRlsContext(req.auth, async client => {
                    const existingResult = await client.query(
                        `
                        SELECT
                            request_id,
                            status,
                            employee_id,
                            leave_type_id,
                            leave_type_name,
                            start_date::text AS start_date,
                            end_date::text AS end_date
                        FROM app.leave_requests
                        WHERE request_id = $1::text
                        LIMIT 1
                        FOR UPDATE
                        `,
                        [requestId]
                    )

                    if (existingResult.rowCount === 0) {
                        throw new Error('Leave request not found')
                    }

                    const existing = existingResult.rows[0]
                    if (existing.status !== 'approved') {
                        throw new Error(
                            'Only approved leave requests can be cancelled'
                        )
                    }

                    const leaveDays = getLeaveDaysInclusive(
                        existing.start_date,
                        existing.end_date
                    )
                    const resolvedLeaveTypeId =
                        await resolveLeaveTypeIdForRequest(
                            client,
                            existing.leave_type_id,
                            existing.leave_type_name
                        )

                    const actorName = getHrActorName(req.auth)

                    await applyLeaveCreditsDelta(
                        client,
                        String(existing.employee_id),
                        resolvedLeaveTypeId,
                        leaveDays
                    )

                    await client.query(
                        `
                        UPDATE app.leave_requests
                        SET status = 'cancelled'::app.request_status
                        WHERE request_id = $1::text
                        `,
                        [requestId]
                    )

                    await client.query(
                        `
                        INSERT INTO app.leave_request_logs (request_id, status, logged_at, approved_by, reason)
                        VALUES (
                          $1::text,
                          'cancelled'::app.request_status,
                          NOW(),
                          $2::text,
                          $3::text
                        )
                        `,
                        [requestId, actorName, reason]
                    )

                    return getLeaveRequestByIdForHrApi(client, requestId)
                })

                return res.json({ request })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.get(
        '/hr/overtime-requests',
        requireAuth,
        requireRole('admin', 'hr_manager'),
        async (req, res) => {
            const status =
                typeof req.query.status === 'string'
                    ? req.query.status.trim().toLowerCase()
                    : null

            if (status && !leaveRequestStatusOptions.has(status)) {
                return res.status(400).json({
                    error: 'Invalid status filter. Use pending, approved, denied, or cancelled.',
                })
            }

            try {
                const rows = await withRlsContext(req.auth, async client => {
                    const params = []
                    const where = ["r.source_page = 'home-overtime'"]

                    if (status) {
                        params.push(status)
                        where.push(
                            `r.status = $${params.length}::app.request_status`
                        )
                    }

                    const filterSql = `WHERE ${where.join(' AND ')}`

                    const result = await client.query(
                        `
                                                SELECT
                                                    r.request_id,
                                                    r.employee_id,
                                                    r.employee_name,
                                                    r.position,
                                                    r.department,
                                                    r.request_date::text AS request_date,
                                                    r.shift_date_from::text AS shift_date_from,
                                                    r.shift_date_to::text AS shift_date_to,
                                                    r.clock_in_time,
                                                    r.clock_out_time,
                                                    r.reason,
                                                    r.break_duration_minutes,
                                                    r.total_work_duration_minutes,
                                                    r.message,
                                                    r.status,
                                                    r.submitted_at,
                                                    r.approved_by,
                                                    r.approved_at,
                                                    r.denied_reason,
                                                    r.source_page,
                                                    COALESCE(a.items, '[]'::jsonb) AS attachments,
                                                    COALESCE(l.items, '[]'::jsonb) AS logs
                                                FROM app.attendance_adjustment_requests r
                                                LEFT JOIN LATERAL (
                                                    SELECT jsonb_agg(
                                                        jsonb_build_object(
                                                            'attachmentId', att.attachment_id,
                                                            'fileName', att.file_name
                                                        )
                                                        ORDER BY att.attachment_id
                                                    ) AS items
                                                    FROM app.adjustment_request_attachments att
                                                    WHERE att.request_id = r.request_id
                                                ) a ON TRUE
                                                LEFT JOIN LATERAL (
                                                    SELECT jsonb_agg(
                                                        jsonb_build_object(
                                                            'logId', lg.log_id,
                                                            'status', lg.status,
                                                            'loggedAt', lg.logged_at,
                                                            'approvedBy', lg.approved_by,
                                                            'reason', lg.reason
                                                        )
                                                        ORDER BY lg.logged_at ASC, lg.log_id ASC
                                                    ) AS items
                                                    FROM app.adjustment_request_logs lg
                                                    WHERE lg.request_id = r.request_id
                                                ) l ON TRUE
                                                ${filterSql}
                                                ORDER BY r.submitted_at DESC, r.request_id DESC
                                                LIMIT 500
                                                `,
                        params
                    )

                    return result.rows
                })

                return res.json({ requests: rows })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.post(
        '/hr/adjustment-requests/:requestId/approve',
        requireAuth,
        requireRole('admin', 'hr_manager'),
        async (req, res) => {
            const requestId = String(req.params.requestId || '').trim()
            if (!requestId) {
                return res.status(400).json({ error: 'Invalid requestId' })
            }

            try {
                const request = await withRlsContext(req.auth, async client => {
                    const existingResult = await client.query(
                        `
                        SELECT request_id, status
                        FROM app.attendance_adjustment_requests
                        WHERE request_id = $1::text
                        LIMIT 1
                        FOR UPDATE
                        `,
                        [requestId]
                    )

                    if (existingResult.rowCount === 0) {
                        throw new Error('Adjustment request not found')
                    }

                    const existing = existingResult.rows[0]
                    if (existing.status !== 'pending') {
                        throw new Error(
                            'Only pending adjustment requests can be approved'
                        )
                    }

                    const actorName = getHrActorName(req.auth)

                    await client.query(
                        `
                        UPDATE app.attendance_adjustment_requests
                        SET
                          status = 'approved'::app.request_status,
                          approved_by = $2::text,
                          approved_at = NOW(),
                          denied_reason = NULL
                        WHERE request_id = $1::text
                        `,
                        [requestId, actorName]
                    )

                    await client.query(
                        `
                        INSERT INTO app.adjustment_request_logs (request_id, status, logged_at, approved_by, reason)
                        VALUES (
                          $1::text,
                          'approved'::app.request_status,
                          NOW(),
                          $2::text,
                          'Approved by HR'
                        )
                        `,
                        [requestId, actorName]
                    )

                    return getAdjustmentRequestByIdForHrApi(client, requestId)
                })

                return res.json({ request })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.post(
        '/hr/adjustment-requests/:requestId/deny',
        requireAuth,
        requireRole('admin', 'hr_manager'),
        async (req, res) => {
            const requestId = String(req.params.requestId || '').trim()
            if (!requestId) {
                return res.status(400).json({ error: 'Invalid requestId' })
            }

            const reason =
                typeof req.body?.reason === 'string'
                    ? req.body.reason.trim()
                    : ''
            if (reason.length < 3) {
                return res.status(400).json({
                    error: 'A denial reason with at least 3 characters is required.',
                })
            }

            try {
                const request = await withRlsContext(req.auth, async client => {
                    const existingResult = await client.query(
                        `
                        SELECT request_id, status
                        FROM app.attendance_adjustment_requests
                        WHERE request_id = $1::text
                        LIMIT 1
                        FOR UPDATE
                        `,
                        [requestId]
                    )

                    if (existingResult.rowCount === 0) {
                        throw new Error('Adjustment request not found')
                    }

                    const existing = existingResult.rows[0]
                    if (existing.status !== 'pending') {
                        throw new Error(
                            'Only pending adjustment requests can be denied'
                        )
                    }

                    const actorName = getHrActorName(req.auth)

                    await client.query(
                        `
                        UPDATE app.attendance_adjustment_requests
                        SET
                          status = 'denied'::app.request_status,
                          approved_by = $2::text,
                          approved_at = NOW(),
                          denied_reason = $3::text
                        WHERE request_id = $1::text
                        `,
                        [requestId, actorName, reason]
                    )

                    await client.query(
                        `
                        INSERT INTO app.adjustment_request_logs (request_id, status, logged_at, approved_by, reason)
                        VALUES (
                          $1::text,
                          'denied'::app.request_status,
                          NOW(),
                          $2::text,
                          $3::text
                        )
                        `,
                        [requestId, actorName, reason]
                    )

                    return getAdjustmentRequestByIdForHrApi(client, requestId)
                })

                return res.json({ request })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.post(
        '/hr/adjustment-requests/:requestId/cancel',
        requireAuth,
        requireRole('admin', 'hr_manager'),
        async (req, res) => {
            const requestId = String(req.params.requestId || '').trim()
            if (!requestId) {
                return res.status(400).json({ error: 'Invalid requestId' })
            }

            const reason =
                typeof req.body?.reason === 'string'
                    ? req.body.reason.trim()
                    : ''
            if (reason.length < 3) {
                return res.status(400).json({
                    error: 'A cancellation reason with at least 3 characters is required.',
                })
            }

            try {
                const request = await withRlsContext(req.auth, async client => {
                    const existingResult = await client.query(
                        `
                        SELECT request_id, status
                        FROM app.attendance_adjustment_requests
                        WHERE request_id = $1::text
                        LIMIT 1
                        FOR UPDATE
                        `,
                        [requestId]
                    )

                    if (existingResult.rowCount === 0) {
                        throw new Error('Adjustment request not found')
                    }

                    const existing = existingResult.rows[0]
                    if (existing.status !== 'approved') {
                        throw new Error(
                            'Only approved adjustment requests can be cancelled'
                        )
                    }

                    await client.query(
                        `
                        UPDATE app.attendance_adjustment_requests
                        SET
                          status = 'cancelled'::app.request_status,
                          approved_by = NULL,
                          approved_at = NULL,
                          denied_reason = NULL
                        WHERE request_id = $1::text
                        `,
                        [requestId]
                    )

                    await client.query(
                        `
                        INSERT INTO app.adjustment_request_logs (request_id, status, logged_at, approved_by, reason)
                        VALUES (
                          $1::text,
                          'cancelled'::app.request_status,
                          NOW(),
                          NULL,
                          $2::text
                        )
                        `,
                        [requestId, reason]
                    )

                    return getAdjustmentRequestByIdForHrApi(client, requestId)
                })

                return res.json({ request })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.get(
        '/hr/employees',
        requireAuth,
        requireRole('admin', 'hr_manager'),
        async (req, res) => {
            try {
                const rows = await withRlsContext(req.auth, async client => {
                    const result = await client.query(
                        `
          SELECT
            e.employee_id,
            e.employee_code,
            e.first_name,
            e.last_name,
            e.email,
            d.name AS department,
            e.position,
            e.attendance_status,
            e.employment_status
          FROM app.employees e
          LEFT JOIN app.departments d ON d.department_id = e.department_id
          ORDER BY e.employee_code
          LIMIT 200
          `
                    )
                    return result.rows
                })

                return res.json({ employees: rows })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )
}
