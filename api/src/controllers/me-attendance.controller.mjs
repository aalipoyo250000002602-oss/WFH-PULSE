import { resolveAttendanceStatus } from '../services/attendance-status.service.mjs'

export function registerMeAttendanceRoutes(app, deps) {
    const {
        requireAuth,
        query,
        withRlsContext,
        pool,
        attendanceTimeZone,
        ensureEmployeeLinkForUser,
        buildAttendanceSyncRange,
        syncAbsentAttendanceForRange,
        mapAttendanceRecordRow,
        mapAttendanceActivityLogRow,
        computeActiveSessionNetMinutes,
        insertAttendanceActivityLog,
        isoDateRegex,
        mapAdjustmentRequestRow,
        attendanceAdjustmentCreateSchema,
        attendanceAdjustmentUpdateSchema,
        computeTotalWorkDurationMinutes,
        getAdjustmentRequestByIdForApi,
        mapOvertimeRequestRow,
        overtimeRequestCreateSchema,
        overtimeRequestUpdateSchema,
        getWorkingScheduleForDate,
        validateOvertimeOutsideWorkingHours,
        buildOvertimeLogReason,
        parsePurposeFromOvertimeMessage,
        seedCalendarSampleAttendanceIfEmpty,
    } = deps

    const autoCloseMissedClockOuts = async (
        authContext,
        employeeId,
        fromDate,
        toDate
    ) => {
        await withRlsContext(authContext, async client => {
            await client.query(
                `
                WITH local_now AS (
                    SELECT (NOW() AT TIME ZONE $1::text)::date AS local_today
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
                WHERE ar.employee_id = $2::text
                    AND ar.record_type = 'actual'::app.attendance_record_type
                    AND ar.clock_in IS NOT NULL
                    AND ar.clock_out IS NULL
                    AND ar.attendance_date < ln.local_today
                    AND ($3::date IS NULL OR ar.attendance_date >= $3::date)
                    AND ($4::date IS NULL OR ar.attendance_date <= $4::date)
                `,
                [attendanceTimeZone, employeeId, fromDate, toDate]
            )
        })
    }

    app.get('/me/attendance', requireAuth, async (req, res) => {
        const from = req.query.from
        const to = req.query.to

        const where = []
        const params = []

        if (typeof from === 'string') {
            params.push(from)
            where.push(`attendance_date >= $${params.length}::date`)
        }
        if (typeof to === 'string') {
            params.push(to)
            where.push(`attendance_date <= $${params.length}::date`)
        }

        where.push(`record_type = 'actual'::app.attendance_record_type`)

        const filterSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

        try {
            const resolvedEmployeeId = await ensureEmployeeLinkForUser(
                req.auth.userId
            )
            if (!resolvedEmployeeId) {
                return res.status(404).json({
                    error: 'No employee profile is linked to this account yet.',
                })
            }

            const { startDate, endDate } = buildAttendanceSyncRange(
                typeof from === 'string' ? from : null,
                typeof to === 'string' ? to : null
            )
            await syncAbsentAttendanceForRange(
                req.auth,
                resolvedEmployeeId,
                startDate,
                endDate
            )
            await autoCloseMissedClockOuts(
                req.auth,
                resolvedEmployeeId,
                typeof from === 'string' ? from : null,
                typeof to === 'string' ? to : null
            )

            const rows = await withRlsContext(req.auth, async client => {
                const result = await client.query(
                    `
                WITH attendance_dates AS (
                  SELECT DISTINCT ar.attendance_date
                  FROM app.attendance_records ar
                  ${filterSql}
                ),
                actual_rows AS (
                  SELECT
                    ar.attendance_date,
                    ar.attendance_id,
                    ar.status,
                    ar.clock_in,
                    ar.clock_out,
                    ar.work_duration_minutes,
                    ar.late_minutes,
                    ar.total_break_duration_minutes,
                    ar.active_break_started_at
                  FROM app.attendance_records ar
                  WHERE ar.employee_id = $1::text
                    AND ar.record_type = 'actual'::app.attendance_record_type
                ),
                adjusted_rows AS (
                  SELECT
                    ar.attendance_date,
                    ar.attendance_id,
                    ar.status,
                    ar.clock_in,
                    ar.clock_out,
                    ar.work_duration_minutes,
                    ar.late_minutes,
                    ar.total_break_duration_minutes
                  FROM app.attendance_records ar
                  WHERE ar.employee_id = $1::text
                    AND ar.record_type = 'adjusted'::app.attendance_record_type
                    AND ar.approval_status = 'approved'::app.request_status
                ),
                overtime_rows AS (
                  SELECT
                    ar.attendance_date,
                    ar.attendance_id,
                    ar.work_duration_minutes
                  FROM app.attendance_records ar
                  WHERE ar.employee_id = $1::text
                    AND ar.record_type = 'overtime'::app.attendance_record_type
                    AND ar.approval_status = 'approved'::app.request_status
                )
                SELECT
                  COALESCE(actual_rows.attendance_id, adjusted_rows.attendance_id, overtime_rows.attendance_id) AS attendance_id,
                  d.attendance_date,
                  'actual'::app.attendance_record_type AS record_type,
                  COALESCE(adjusted_rows.status, actual_rows.status, 'absent'::app.attendance_status) AS status,
                  COALESCE(adjusted_rows.clock_in, actual_rows.clock_in) AS clock_in,
                  COALESCE(adjusted_rows.clock_out, actual_rows.clock_out) AS clock_out,
                  (COALESCE(adjusted_rows.work_duration_minutes, actual_rows.work_duration_minutes, 0)
                    + COALESCE(overtime_rows.work_duration_minutes, 0))::integer AS work_duration_minutes,
                  COALESCE(adjusted_rows.late_minutes, actual_rows.late_minutes, 0) AS late_minutes,
                  COALESCE(adjusted_rows.total_break_duration_minutes, actual_rows.total_break_duration_minutes, 0)
                    AS total_break_duration_minutes,
                  actual_rows.active_break_started_at
                FROM attendance_dates d
                LEFT JOIN actual_rows ON actual_rows.attendance_date = d.attendance_date
                LEFT JOIN adjusted_rows ON adjusted_rows.attendance_date = d.attendance_date
                LEFT JOIN overtime_rows ON overtime_rows.attendance_date = d.attendance_date
                ORDER BY d.attendance_date DESC
                LIMIT 90
                `,
                    params
                )
                return result.rows
            })

            return res.json({ attendance: rows.map(mapAttendanceRecordRow) })
        } catch (error) {
            return res.status(400).json({ error: error.message })
        }
    })

    app.get('/me/attendance/today', requireAuth, async (req, res) => {
        try {
            const resolvedEmployeeId = await ensureEmployeeLinkForUser(
                req.auth.userId
            )
            if (!resolvedEmployeeId) {
                return res.status(404).json({
                    error: 'No employee profile is linked to this account yet.',
                })
            }

            const payload = await withRlsContext(req.auth, async client => {
                const nowResult = await client.query(
                    `
                SELECT
                  NOW() AS now_at,
                  (NOW() AT TIME ZONE $1::text) AS now_local
                `,
                    [attendanceTimeZone]
                )
                const nowAt = nowResult.rows[0].now_at
                const nowLocal = nowResult.rows[0].now_local

                const result = await client.query(
                    `
                SELECT
                  attendance_id,
                  attendance_date,
                  record_type,
                  status,
                  clock_in,
                  clock_out,
                  work_duration_minutes,
                  late_minutes,
                  total_break_duration_minutes,
                  active_break_started_at
                FROM app.attendance_records
                WHERE employee_id = $1::text
                  AND attendance_date = (NOW() AT TIME ZONE $2::text)::date
                  AND record_type = 'actual'::app.attendance_record_type
                LIMIT 1
                `,
                    [resolvedEmployeeId, attendanceTimeZone]
                )

                const attendance = result.rows[0] ?? null
                if (!attendance) {
                    return {
                        attendance: null,
                        currentWorkDurationMinutes: 0,
                        logs: [],
                    }
                }

                let currentWorkDurationMinutes = Number(
                    attendance.work_duration_minutes ?? 0
                )
                if (attendance.clock_in && !attendance.clock_out) {
                    const sessionNetMinutes =
                        await computeActiveSessionNetMinutes(client, {
                            nowLocal,
                            nowAt,
                            attendanceDate: attendance.attendance_date,
                            clockIn: attendance.clock_in,
                            attendanceId: attendance.attendance_id,
                            attendanceTimeZoneValue: attendanceTimeZone,
                        })
                    currentWorkDurationMinutes += sessionNetMinutes
                }

                const logsResult = await client.query(
                    `
                SELECT activity_id, action, logged_at, metadata
                FROM app.attendance_activity_logs
                WHERE attendance_id = $1::bigint
                ORDER BY logged_at DESC
                LIMIT 50
                `,
                    [attendance.attendance_id]
                )

                return {
                    attendance,
                    currentWorkDurationMinutes,
                    logs: logsResult.rows.map(mapAttendanceActivityLogRow),
                }
            })

            return res.json({
                attendance: payload.attendance
                    ? mapAttendanceRecordRow(payload.attendance)
                    : null,
                currentWorkDurationMinutes: payload.currentWorkDurationMinutes,
                logs: payload.logs,
            })
        } catch (error) {
            return res.status(400).json({ error: error.message })
        }
    })

    app.post('/me/attendance/clock-in', requireAuth, async (req, res) => {
        try {
            const resolvedEmployeeId = await ensureEmployeeLinkForUser(
                req.auth.userId
            )
            if (!resolvedEmployeeId) {
                return res.status(404).json({
                    error: 'No employee profile is linked to this account yet.',
                })
            }

            const attendance = await withRlsContext(req.auth, async client => {
                const nowResult = await client.query(
                    `
                SELECT
                  NOW() AS now_at,
                  (NOW() AT TIME ZONE $1::text) AS now_local,
                  (NOW() AT TIME ZONE $1::text)::time AS now_time,
                  (NOW() AT TIME ZONE $1::text)::date AS today_date
                `,
                    [attendanceTimeZone]
                )
                const nowAt = nowResult.rows[0].now_at
                const nowTime = nowResult.rows[0].now_time
                const todayDate = nowResult.rows[0].today_date

                const existingResult = await client.query(
                    `
                SELECT
                  attendance_id,
                  attendance_date,
                  record_type,
                  status,
                  clock_in,
                  clock_out,
                  work_duration_minutes,
                  late_minutes,
                  total_break_duration_minutes,
                  active_break_started_at
                FROM app.attendance_records
                WHERE employee_id = $1::text
                  AND attendance_date = $2::date
                  AND record_type = 'actual'::app.attendance_record_type
                LIMIT 1
                FOR UPDATE
                `,
                    [resolvedEmployeeId, todayDate]
                )

                if (existingResult.rowCount === 0) {
                    const lateComputationResult = await client.query(
                        `
                  WITH schedule AS (
                    SELECT is_working_day, start_time
                    FROM app.company_settings_working_hours
                    WHERE iso_day = EXTRACT(ISODOW FROM $1::date)::smallint
                    LIMIT 1
                  )
                  SELECT
                    CASE
                      WHEN COALESCE((SELECT is_working_day FROM schedule), false)
                        AND (SELECT start_time FROM schedule) IS NOT NULL
                        AND $2::time >= ((SELECT start_time FROM schedule) + INTERVAL '15 minutes')::time
                      THEN GREATEST(
                        0,
                        FLOOR(EXTRACT(EPOCH FROM ($2::time - (SELECT start_time FROM schedule))) / 60)::integer
                      )
                      ELSE 0
                    END AS late_minutes,
                    CASE
                      WHEN COALESCE((SELECT is_working_day FROM schedule), false)
                        AND (SELECT start_time FROM schedule) IS NOT NULL
                        AND $2::time >= ((SELECT start_time FROM schedule) + INTERVAL '15 minutes')::time
                      THEN 'late'
                      ELSE 'present'
                    END AS attendance_status
                  `,
                        [todayDate, nowTime]
                    )

                    const lateMinutes = Number(
                        lateComputationResult.rows[0]?.late_minutes ?? 0
                    )
                    const attendanceStatus = String(
                        lateComputationResult.rows[0]?.attendance_status ??
                            'present'
                    )

                    const insertedResult = await client.query(
                        `
                  INSERT INTO app.attendance_records (
                    employee_id,
                    attendance_date,
                    record_type,
                    status,
                    clock_in,
                    clock_out,
                    work_duration_minutes,
                    late_minutes,
                    total_break_duration_minutes,
                    active_break_started_at
                  )
                  VALUES (
                    $1::text,
                    $2::date,
                    'actual'::app.attendance_record_type,
                    $4::app.attendance_status,
                    $3::time,
                    NULL,
                    0,
                    $5::integer,
                    0,
                    NULL
                  )
                  RETURNING
                    attendance_id,
                    attendance_date,
                    record_type,
                    status,
                    clock_in,
                    clock_out,
                    work_duration_minutes,
                    late_minutes,
                    total_break_duration_minutes,
                    active_break_started_at
                  `,
                        [
                            resolvedEmployeeId,
                            todayDate,
                            nowTime,
                            attendanceStatus,
                            lateMinutes,
                        ]
                    )

                    await insertAttendanceActivityLog(client, {
                        attendanceId: insertedResult.rows[0].attendance_id,
                        employeeId: resolvedEmployeeId,
                        action: 'clock_in',
                        metadata: {
                            clockInTime: String(
                                insertedResult.rows[0].clock_in ?? ''
                            ),
                            source: 'home',
                        },
                    })

                    return insertedResult.rows[0]
                }

                const existing = existingResult.rows[0]
                if (existing.clock_in && !existing.clock_out) {
                    throw new Error('You are already clocked in for today.')
                }

                const updatedResult = await client.query(
                    `
                UPDATE app.attendance_records
                SET
                  status = CASE
                    WHEN COALESCE(late_minutes, 0) >= 15 THEN 'late'::app.attendance_status
                    ELSE 'present'::app.attendance_status
                  END,
                  clock_in = $1::time,
                  clock_out = NULL,
                  active_break_started_at = NULL
                WHERE attendance_id = $2::bigint
                RETURNING
                  attendance_id,
                  attendance_date,
                  status,
                  clock_in,
                  clock_out,
                  work_duration_minutes,
                  late_minutes,
                  total_break_duration_minutes,
                  active_break_started_at
                `,
                    [nowTime, existing.attendance_id]
                )

                await insertAttendanceActivityLog(client, {
                    attendanceId: existing.attendance_id,
                    employeeId: resolvedEmployeeId,
                    action: 'clock_in',
                    metadata: {
                        clockInTime: String(
                            updatedResult.rows[0].clock_in ?? ''
                        ),
                        source: 'home',
                    },
                })

                return updatedResult.rows[0]
            })

            return res
                .status(201)
                .json({ attendance: mapAttendanceRecordRow(attendance) })
        } catch (error) {
            return res.status(400).json({ error: error.message })
        }
    })

    app.post('/me/attendance/break/start', requireAuth, async (req, res) => {
        try {
            const resolvedEmployeeId = await ensureEmployeeLinkForUser(
                req.auth.userId
            )
            if (!resolvedEmployeeId) {
                return res.status(404).json({
                    error: 'No employee profile is linked to this account yet.',
                })
            }

            const responsePayload = await withRlsContext(
                req.auth,
                async client => {
                    const nowResult = await client.query(
                        `
                SELECT
                  NOW() AS now_at,
                  (NOW() AT TIME ZONE $1::text)::date AS today_date
                `,
                        [attendanceTimeZone]
                    )
                    const nowAt = nowResult.rows[0].now_at
                    const todayDate = nowResult.rows[0].today_date

                    const attendanceResult = await client.query(
                        `
                SELECT
                  attendance_id,
                  attendance_date,
                  record_type,
                  status,
                  clock_in,
                  clock_out,
                  work_duration_minutes,
                  late_minutes,
                  total_break_duration_minutes,
                  active_break_started_at
                FROM app.attendance_records
                WHERE employee_id = $1::text
                  AND attendance_date = $2::date
                  AND record_type = 'actual'::app.attendance_record_type
                LIMIT 1
                FOR UPDATE
                `,
                        [resolvedEmployeeId, todayDate]
                    )

                    if (attendanceResult.rowCount === 0) {
                        throw new Error(
                            'No attendance record found for today. Please clock in first.'
                        )
                    }

                    const attendance = attendanceResult.rows[0]

                    if (!attendance.clock_in || attendance.clock_out) {
                        throw new Error(
                            'Break can only be started while clocked in.'
                        )
                    }

                    if (attendance.active_break_started_at) {
                        throw new Error('A break is already in progress.')
                    }

                    const openBreakResult = await client.query(
                        `
                SELECT break_id
                FROM app.attendance_break_logs
                WHERE attendance_id = $1::bigint
                  AND break_ended_at IS NULL
                LIMIT 1
                FOR UPDATE
                `,
                        [attendance.attendance_id]
                    )

                    if (openBreakResult.rowCount > 0) {
                        throw new Error('A break is already in progress.')
                    }

                    const breakResult = await client.query(
                        `
                INSERT INTO app.attendance_break_logs (
                  attendance_id,
                  break_started_at,
                  break_ended_at,
                  break_duration_minutes
                )
                VALUES ($1::bigint, $2::timestamptz, NULL, NULL)
                RETURNING break_id, break_started_at
                `,
                        [attendance.attendance_id, nowAt]
                    )

                    const updatedAttendanceResult = await client.query(
                        `
                UPDATE app.attendance_records
                SET active_break_started_at = $1::timestamptz
                WHERE attendance_id = $2::bigint
                RETURNING
                  attendance_id,
                  attendance_date,
                  status,
                  clock_in,
                  clock_out,
                  work_duration_minutes,
                  late_minutes,
                  total_break_duration_minutes,
                  active_break_started_at
                `,
                        [nowAt, attendance.attendance_id]
                    )

                    await insertAttendanceActivityLog(client, {
                        attendanceId: attendance.attendance_id,
                        employeeId: resolvedEmployeeId,
                        action: 'break_start',
                        metadata: {
                            breakId: Number(breakResult.rows[0].break_id),
                            source: 'home',
                        },
                    })

                    return {
                        attendance: updatedAttendanceResult.rows[0],
                        breakLog: breakResult.rows[0],
                    }
                }
            )

            return res.status(201).json({
                attendance: mapAttendanceRecordRow(responsePayload.attendance),
                breakLog: {
                    breakId: Number(responsePayload.breakLog.break_id),
                    breakStartedAt: responsePayload.breakLog.break_started_at,
                },
            })
        } catch (error) {
            return res.status(400).json({ error: error.message })
        }
    })

    app.post('/me/attendance/break/end', requireAuth, async (req, res) => {
        try {
            const resolvedEmployeeId = await ensureEmployeeLinkForUser(
                req.auth.userId
            )
            if (!resolvedEmployeeId) {
                return res.status(404).json({
                    error: 'No employee profile is linked to this account yet.',
                })
            }

            const responsePayload = await withRlsContext(
                req.auth,
                async client => {
                    const nowResult = await client.query(
                        `
                SELECT
                  NOW() AS now_at,
                  (NOW() AT TIME ZONE $1::text)::date AS today_date
                `,
                        [attendanceTimeZone]
                    )
                    const nowAt = nowResult.rows[0].now_at
                    const todayDate = nowResult.rows[0].today_date

                    const attendanceResult = await client.query(
                        `
                SELECT
                  attendance_id,
                  attendance_date,
                  record_type,
                  status,
                  clock_in,
                  clock_out,
                  work_duration_minutes,
                  late_minutes,
                  total_break_duration_minutes,
                  active_break_started_at
                FROM app.attendance_records
                WHERE employee_id = $1::text
                  AND attendance_date = $2::date
                  AND record_type = 'actual'::app.attendance_record_type
                LIMIT 1
                FOR UPDATE
                `,
                        [resolvedEmployeeId, todayDate]
                    )

                    if (attendanceResult.rowCount === 0) {
                        throw new Error('No attendance record found for today.')
                    }

                    const attendance = attendanceResult.rows[0]

                    if (!attendance.clock_in || attendance.clock_out) {
                        throw new Error('No active shift found to end a break.')
                    }

                    if (!attendance.active_break_started_at) {
                        throw new Error('No active break found.')
                    }

                    const openBreakResult = await client.query(
                        `
                SELECT break_id, break_started_at
                FROM app.attendance_break_logs
                WHERE attendance_id = $1::bigint
                  AND break_ended_at IS NULL
                ORDER BY break_started_at DESC
                LIMIT 1
                FOR UPDATE
                `,
                        [attendance.attendance_id]
                    )

                    if (openBreakResult.rowCount === 0) {
                        throw new Error('No active break found.')
                    }

                    const openBreak = openBreakResult.rows[0]
                    const startedAtMs = new Date(
                        openBreak.break_started_at
                    ).getTime()
                    const endedAtMs = new Date(nowAt).getTime()
                    const durationMinutes = Math.max(
                        0,
                        Math.floor((endedAtMs - startedAtMs) / (1000 * 60))
                    )

                    await client.query(
                        `
                UPDATE app.attendance_break_logs
                SET
                  break_ended_at = $1::timestamptz,
                  break_duration_minutes = $2::integer
                WHERE break_id = $3::bigint
                `,
                        [nowAt, durationMinutes, openBreak.break_id]
                    )

                    const updatedAttendanceResult = await client.query(
                        `
                UPDATE app.attendance_records
                SET
                  total_break_duration_minutes = COALESCE(total_break_duration_minutes, 0) + $1::integer,
                  active_break_started_at = NULL
                WHERE attendance_id = $2::bigint
                RETURNING
                  attendance_id,
                  attendance_date,
                  status,
                  clock_in,
                  clock_out,
                  work_duration_minutes,
                  late_minutes,
                  total_break_duration_minutes,
                  active_break_started_at
                `,
                        [durationMinutes, attendance.attendance_id]
                    )

                    await insertAttendanceActivityLog(client, {
                        attendanceId: attendance.attendance_id,
                        employeeId: resolvedEmployeeId,
                        action: 'break_end',
                        metadata: {
                            breakId: Number(openBreak.break_id),
                            breakDurationMinutes: durationMinutes,
                            source: 'home',
                        },
                    })

                    return {
                        attendance: updatedAttendanceResult.rows[0],
                        breakLog: {
                            breakId: Number(openBreak.break_id),
                            breakStartedAt: openBreak.break_started_at,
                            breakEndedAt: nowAt,
                            breakDurationMinutes: durationMinutes,
                        },
                    }
                }
            )

            return res.json({
                attendance: mapAttendanceRecordRow(responsePayload.attendance),
                breakLog: responsePayload.breakLog,
            })
        } catch (error) {
            return res.status(400).json({ error: error.message })
        }
    })

    app.post('/me/attendance/clock-out', requireAuth, async (req, res) => {
        try {
            const resolvedEmployeeId = await ensureEmployeeLinkForUser(
                req.auth.userId
            )
            if (!resolvedEmployeeId) {
                return res.status(404).json({
                    error: 'No employee profile is linked to this account yet.',
                })
            }

            const attendance = await withRlsContext(req.auth, async client => {
                const nowResult = await client.query(
                    `
                SELECT
                  NOW() AS now_at,
                  (NOW() AT TIME ZONE $1::text) AS now_local,
                  (NOW() AT TIME ZONE $1::text)::time AS now_time,
                  (NOW() AT TIME ZONE $1::text)::date AS today_date
                `,
                    [attendanceTimeZone]
                )
                const nowAt = nowResult.rows[0].now_at
                const nowLocal = nowResult.rows[0].now_local
                const nowTime = nowResult.rows[0].now_time
                const todayDate = nowResult.rows[0].today_date

                const attendanceResult = await client.query(
                    `
                SELECT
                  attendance_id,
                  attendance_date,
                  record_type,
                  status,
                  clock_in,
                  clock_out,
                  work_duration_minutes,
                  late_minutes,
                  total_break_duration_minutes,
                  active_break_started_at
                FROM app.attendance_records
                WHERE employee_id = $1::text
                  AND attendance_date = $2::date
                  AND record_type = 'actual'::app.attendance_record_type
                LIMIT 1
                FOR UPDATE
                `,
                    [resolvedEmployeeId, todayDate]
                )

                if (attendanceResult.rowCount === 0) {
                    throw new Error(
                        'No attendance record found for today. Please clock in first.'
                    )
                }

                const attendance = attendanceResult.rows[0]
                if (!attendance.clock_in) {
                    throw new Error('You are not clocked in yet.')
                }
                if (attendance.clock_out) {
                    throw new Error('You are already clocked out for today.')
                }
                if (attendance.active_break_started_at) {
                    throw new Error(
                        'Please end your break before clocking out.'
                    )
                }

                const sessionNetMinutes = await computeActiveSessionNetMinutes(
                    client,
                    {
                        nowLocal,
                        nowAt,
                        attendanceDate: attendance.attendance_date,
                        clockIn: attendance.clock_in,
                        attendanceId: attendance.attendance_id,
                        attendanceTimeZoneValue: attendanceTimeZone,
                    }
                )
                const computedDurationMinutes =
                    Number(attendance.work_duration_minutes ?? 0) +
                    Number(sessionNetMinutes)
                const resolvedStatus = resolveAttendanceStatus({
                    workDurationMinutes: computedDurationMinutes,
                    lateMinutes: Number(attendance.late_minutes ?? 0),
                    clockIn: attendance.clock_in,
                    clockOut: nowTime,
                })

                const updatedResult = await client.query(
                    `
                UPDATE app.attendance_records
                SET
                  clock_out = $1::time,
                  work_duration_minutes = $2::integer,
                                    status = $4::app.attendance_status
                WHERE attendance_id = $3::bigint
                RETURNING
                  attendance_id,
                  attendance_date,
                  status,
                  clock_in,
                  clock_out,
                  work_duration_minutes,
                  late_minutes,
                  total_break_duration_minutes,
                  active_break_started_at
                `,
                    [
                        nowTime,
                        computedDurationMinutes,
                        attendance.attendance_id,
                        resolvedStatus,
                    ]
                )

                await insertAttendanceActivityLog(client, {
                    attendanceId: attendance.attendance_id,
                    employeeId: resolvedEmployeeId,
                    action: 'clock_out',
                    metadata: {
                        clockOutTime: String(
                            updatedResult.rows[0].clock_out ?? ''
                        ),
                        sessionNetMinutes,
                        source: 'home',
                    },
                })

                return updatedResult.rows[0]
            })

            return res.json({ attendance: mapAttendanceRecordRow(attendance) })
        } catch (error) {
            return res.status(400).json({ error: error.message })
        }
    })

    app.get('/me/attendance-adjustments', requireAuth, async (req, res) => {
        try {
            const resolvedEmployeeId = await ensureEmployeeLinkForUser(
                req.auth.userId
            )
            if (!resolvedEmployeeId) {
                return res.status(404).json({
                    error: 'No employee profile is linked to this account yet.',
                })
            }

            const requestDate =
                typeof req.query.date === 'string' ? req.query.date : null
            if (requestDate && !isoDateRegex.test(requestDate)) {
                return res
                    .status(400)
                    .json({ error: 'Invalid date query. Use YYYY-MM-DD' })
            }

            const requests = await withRlsContext(req.auth, async client => {
                const params = [resolvedEmployeeId, 'home']
                let dateFilterSql = ''
                if (requestDate) {
                    params.push(requestDate)
                    dateFilterSql = `AND r.request_date = $${params.length}::date`
                }

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
                    ORDER BY lg.logged_at ASC
                  ) AS items
                  FROM app.adjustment_request_logs lg
                  WHERE lg.request_id = r.request_id
                ) l ON TRUE
                WHERE r.employee_id = $1::text
                  AND r.source_page = $2::text
                  ${dateFilterSql}
                ORDER BY r.request_date DESC, r.submitted_at DESC
                LIMIT 300
                `,
                    params
                )

                return result.rows
            })

            return res.json({
                requests: requests.map(mapAdjustmentRequestRow),
            })
        } catch (error) {
            return res.status(400).json({ error: error.message })
        }
    })

    app.post('/me/attendance-adjustments', requireAuth, async (req, res) => {
        const parsed = attendanceAdjustmentCreateSchema.safeParse(req.body)
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.flatten() })
        }

        const payload = parsed.data
        if (payload.shiftDateFrom > payload.shiftDateTo) {
            return res
                .status(400)
                .json({
                    error: 'shiftDateFrom must be on or before shiftDateTo',
                })
        }

        if (
            payload.date !== payload.shiftDateFrom ||
            payload.date !== payload.shiftDateTo
        ) {
            return res.status(400).json({
                error: 'For calendar adjustment requests, date, shiftDateFrom, and shiftDateTo must match.',
            })
        }

        const totalMinutes = computeTotalWorkDurationMinutes(
            payload.clockInTime,
            payload.clockOutTime,
            payload.breakDuration
        )
        if (totalMinutes == null) {
            return res.status(400).json({
                error: 'Invalid work duration. Ensure clockOutTime is later than clockInTime after break.',
            })
        }

        try {
            const resolvedEmployeeId = await ensureEmployeeLinkForUser(
                req.auth.userId
            )
            if (!resolvedEmployeeId) {
                return res.status(404).json({
                    error: 'No employee profile is linked to this account yet.',
                })
            }

            const request = await withRlsContext(req.auth, async client => {
                const duplicateResult = await client.query(
                    `
                SELECT request_id, status, submitted_at
                FROM app.attendance_adjustment_requests
                WHERE employee_id = $1::text
                  AND request_date = $2::date
                  AND source_page = 'home'
                  AND status <> 'cancelled'::app.request_status
                LIMIT 1
                `,
                    [resolvedEmployeeId, payload.date]
                )

                if (duplicateResult.rowCount > 0) {
                    const existingRequest = duplicateResult.rows[0]

                    if (existingRequest.status === 'approved') {
                        throw new Error(
                            'An approved adjustment request already exists for this date. Revoke it first before submitting a new one.'
                        )
                    }

                    const existingRequestId = existingRequest.request_id

                    await client.query(
                        `
                  UPDATE app.attendance_adjustment_requests
                  SET
                    shift_date_from = $1::date,
                    shift_date_to = $2::date,
                    clock_in_time = $3::text,
                    clock_out_time = $4::text,
                    reason = $5::app.adjustment_reason,
                    break_duration_minutes = $6::integer,
                    total_work_duration_minutes = $7::integer,
                    message = $8::text,
                    status = 'pending'::app.request_status,
                    approved_by = NULL,
                    approved_at = NULL,
                    denied_reason = NULL
                  WHERE request_id = $9::text
                  `,
                        [
                            payload.shiftDateFrom,
                            payload.shiftDateTo,
                            payload.clockInTime,
                            payload.clockOutTime,
                            payload.reason,
                            payload.breakDuration,
                            totalMinutes,
                            payload.message.trim(),
                            existingRequestId,
                        ]
                    )

                    await client.query(
                        `
                  DELETE FROM app.adjustment_request_attachments
                  WHERE request_id = $1::text
                  `,
                        [existingRequestId]
                    )

                    const attachments = Array.isArray(payload.attachments)
                        ? payload.attachments
                        : []
                    for (const fileName of attachments) {
                        await client.query(
                            `
                    INSERT INTO app.adjustment_request_attachments (request_id, file_name)
                    VALUES ($1::text, $2::text)
                    `,
                            [existingRequestId, fileName]
                        )
                    }

                    await client.query(
                        `
                  DELETE FROM app.adjustment_request_logs
                  WHERE request_id = $1::text
                  `,
                        [existingRequestId]
                    )

                    await client.query(
                        `
                  INSERT INTO app.adjustment_request_logs (request_id, status, logged_at, approved_by, reason)
                  VALUES (
                    $1::text,
                    'pending'::app.request_status,
                    COALESCE($2::timestamptz, NOW()),
                    NULL,
                    'Request submitted'
                  )
                  `,
                        [existingRequestId, existingRequest.submitted_at]
                    )

                    return getAdjustmentRequestByIdForApi(
                        client,
                        existingRequestId
                    )
                }

                const employeeResult = await client.query(
                    `
                SELECT
                  e.first_name,
                  e.last_name,
                  COALESCE(jp.name, e.position, 'Employee') AS position,
                  COALESCE(d.name, 'N/A') AS department
                FROM app.employees e
                LEFT JOIN app.job_positions jp ON jp.position_id = e.position_id
                LEFT JOIN app.departments d ON d.department_id = e.department_id
                WHERE e.employee_id = $1::text
                LIMIT 1
                `,
                    [resolvedEmployeeId]
                )

                const employeeRow = employeeResult.rows[0] ?? null
                const employeeName = employeeRow
                    ? `${employeeRow.first_name ?? ''} ${employeeRow.last_name ?? ''}`.trim() ||
                      'Employee'
                    : 'Employee'

                const requestId = `adj-home-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

                await client.query(
                    `
                INSERT INTO app.attendance_adjustment_requests (
                  request_id,
                  employee_id,
                  employee_name,
                  position,
                  department,
                  request_date,
                  shift_date_from,
                  shift_date_to,
                  clock_in_time,
                  clock_out_time,
                  reason,
                  break_duration_minutes,
                  total_work_duration_minutes,
                  message,
                  status,
                  submitted_at,
                  source_page
                )
                VALUES (
                  $1::text,
                  $2::text,
                  $3::text,
                  $4::text,
                  $5::text,
                  $6::date,
                  $7::date,
                  $8::date,
                  $9::text,
                  $10::text,
                  $11::app.adjustment_reason,
                  $12::integer,
                  $13::integer,
                  $14::text,
                  'pending'::app.request_status,
                  NOW(),
                  'home'
                )
                `,
                    [
                        requestId,
                        resolvedEmployeeId,
                        employeeName,
                        employeeRow?.position ?? 'Employee',
                        employeeRow?.department ?? 'N/A',
                        payload.date,
                        payload.shiftDateFrom,
                        payload.shiftDateTo,
                        payload.clockInTime,
                        payload.clockOutTime,
                        payload.reason,
                        payload.breakDuration,
                        totalMinutes,
                        payload.message.trim(),
                    ]
                )

                const attachments = Array.isArray(payload.attachments)
                    ? payload.attachments
                    : []
                for (const fileName of attachments) {
                    await client.query(
                        `
                  INSERT INTO app.adjustment_request_attachments (request_id, file_name)
                  VALUES ($1::text, $2::text)
                  `,
                        [requestId, fileName]
                    )
                }

                await client.query(
                    `
                INSERT INTO app.adjustment_request_logs (request_id, status, logged_at, approved_by, reason)
                VALUES ($1::text, 'pending'::app.request_status, NOW(), NULL, 'Request submitted')
                `,
                    [requestId]
                )

                return getAdjustmentRequestByIdForApi(client, requestId)
            })

            return res
                .status(201)
                .json({ request: mapAdjustmentRequestRow(request) })
        } catch (error) {
            return res.status(400).json({ error: error.message })
        }
    })

    app.put(
        '/me/attendance-adjustments/:requestId',
        requireAuth,
        async (req, res) => {
            const requestId = String(req.params.requestId || '').trim()
            if (!requestId) {
                return res.status(400).json({ error: 'Invalid requestId' })
            }

            const parsed = attendanceAdjustmentUpdateSchema.safeParse(req.body)
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.flatten() })
            }

            const payload = parsed.data
            if (payload.shiftDateFrom > payload.shiftDateTo) {
                return res.status(400).json({
                    error: 'shiftDateFrom must be on or before shiftDateTo',
                })
            }

            if (
                payload.date !== payload.shiftDateFrom ||
                payload.date !== payload.shiftDateTo
            ) {
                return res.status(400).json({
                    error: 'For calendar adjustment requests, date, shiftDateFrom, and shiftDateTo must match.',
                })
            }

            const totalMinutes = computeTotalWorkDurationMinutes(
                payload.clockInTime,
                payload.clockOutTime,
                payload.breakDuration
            )
            if (totalMinutes == null) {
                return res.status(400).json({
                    error: 'Invalid work duration. Ensure clockOutTime is later than clockInTime after break.',
                })
            }

            try {
                const resolvedEmployeeId = await ensureEmployeeLinkForUser(
                    req.auth.userId
                )
                if (!resolvedEmployeeId) {
                    return res.status(404).json({
                        error: 'No employee profile is linked to this account yet.',
                    })
                }

                const request = await withRlsContext(req.auth, async client => {
                    const existingResult = await client.query(
                        `
                SELECT request_id, status, submitted_at
                FROM app.attendance_adjustment_requests
                WHERE request_id = $1::text
                  AND employee_id = $2::text
                  AND source_page = 'home'
                LIMIT 1
                `,
                        [requestId, resolvedEmployeeId]
                    )

                    if (existingResult.rowCount === 0) {
                        throw new Error('Adjustment request not found')
                    }

                    const existing = existingResult.rows[0]
                    if (existing.status === 'approved') {
                        throw new Error(
                            'Approved requests must be revoked before updating'
                        )
                    }

                    if (existing.status === 'cancelled') {
                        throw new Error('Cancelled requests cannot be updated')
                    }

                    await client.query(
                        `
                UPDATE app.attendance_adjustment_requests
                SET
                  request_date = $1::date,
                  shift_date_from = $2::date,
                  shift_date_to = $3::date,
                  clock_in_time = $4::text,
                  clock_out_time = $5::text,
                  reason = $6::app.adjustment_reason,
                  break_duration_minutes = $7::integer,
                  total_work_duration_minutes = $8::integer,
                  message = $9::text,
                  status = 'pending'::app.request_status,
                  approved_by = NULL,
                  approved_at = NULL,
                  denied_reason = NULL
                WHERE request_id = $10::text
                `,
                        [
                            payload.date,
                            payload.shiftDateFrom,
                            payload.shiftDateTo,
                            payload.clockInTime,
                            payload.clockOutTime,
                            payload.reason,
                            payload.breakDuration,
                            totalMinutes,
                            payload.message.trim(),
                            requestId,
                        ]
                    )

                    await client.query(
                        `
                DELETE FROM app.adjustment_request_attachments
                WHERE request_id = $1::text
                `,
                        [requestId]
                    )

                    const attachments = Array.isArray(payload.attachments)
                        ? payload.attachments
                        : []
                    for (const fileName of attachments) {
                        await client.query(
                            `
                  INSERT INTO app.adjustment_request_attachments (request_id, file_name)
                  VALUES ($1::text, $2::text)
                  `,
                            [requestId, fileName]
                        )
                    }

                    await client.query(
                        `
                DELETE FROM app.adjustment_request_logs
                WHERE request_id = $1::text
                `,
                        [requestId]
                    )

                    await client.query(
                        `
                INSERT INTO app.adjustment_request_logs (request_id, status, logged_at, approved_by, reason)
                VALUES (
                  $1::text,
                  'pending'::app.request_status,
                  COALESCE($2::timestamptz, NOW()),
                  NULL,
                  'Request updated by employee'
                )
                `,
                        [requestId, existing.submitted_at]
                    )

                    return getAdjustmentRequestByIdForApi(client, requestId)
                })

                return res.json({ request: mapAdjustmentRequestRow(request) })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.delete(
        '/me/attendance-adjustments/:requestId',
        requireAuth,
        async (req, res) => {
            const requestId = String(req.params.requestId || '').trim()
            if (!requestId) {
                return res.status(400).json({ error: 'Invalid requestId' })
            }

            try {
                const resolvedEmployeeId = await ensureEmployeeLinkForUser(
                    req.auth.userId
                )
                if (!resolvedEmployeeId) {
                    return res.status(404).json({
                        error: 'No employee profile is linked to this account yet.',
                    })
                }

                await withRlsContext(req.auth, async client => {
                    const existingResult = await client.query(
                        `
                SELECT request_id, status
                FROM app.attendance_adjustment_requests
                WHERE request_id = $1::text
                  AND employee_id = $2::text
                  AND source_page = 'home'
                LIMIT 1
                `,
                        [requestId, resolvedEmployeeId]
                    )

                    if (existingResult.rowCount === 0) {
                        throw new Error('Adjustment request not found')
                    }

                    const existing = existingResult.rows[0]
                    if (existing.status === 'approved') {
                        throw new Error(
                            'Approved requests cannot be deleted. Revoke first.'
                        )
                    }

                    await client.query(
                        `
                DELETE FROM app.attendance_adjustment_requests
                WHERE request_id = $1::text
                `,
                        [requestId]
                    )
                })

                return res.json({ deleted: true, requestId })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.post(
        '/me/attendance-adjustments/:requestId/revoke',
        requireAuth,
        async (req, res) => {
            const requestId = String(req.params.requestId || '').trim()
            if (!requestId) {
                return res.status(400).json({ error: 'Invalid requestId' })
            }

            try {
                const resolvedEmployeeId = await ensureEmployeeLinkForUser(
                    req.auth.userId
                )
                if (!resolvedEmployeeId) {
                    return res.status(404).json({
                        error: 'No employee profile is linked to this account yet.',
                    })
                }

                const request = await withRlsContext(req.auth, async client => {
                    const existingResult = await client.query(
                        `
                SELECT request_id, status, submitted_at
                FROM app.attendance_adjustment_requests
                WHERE request_id = $1::text
                  AND employee_id = $2::text
                  AND source_page = 'home'
                LIMIT 1
                `,
                        [requestId, resolvedEmployeeId]
                    )

                    if (existingResult.rowCount === 0) {
                        throw new Error('Adjustment request not found')
                    }

                    const existing = existingResult.rows[0]
                    if (existing.status !== 'approved') {
                        throw new Error('Only approved requests can be revoked')
                    }

                    await client.query(
                        `
                UPDATE app.attendance_adjustment_requests
                SET
                  status = 'pending'::app.request_status,
                  approved_by = NULL,
                  approved_at = NULL,
                  denied_reason = NULL
                WHERE request_id = $1::text
                `,
                        [requestId]
                    )

                    await client.query(
                        `
                DELETE FROM app.adjustment_request_logs
                WHERE request_id = $1::text
                `,
                        [requestId]
                    )

                    await client.query(
                        `
                INSERT INTO app.adjustment_request_logs (request_id, status, logged_at, approved_by, reason)
                VALUES (
                  $1::text,
                  'pending'::app.request_status,
                  COALESCE($2::timestamptz, NOW()),
                  NULL,
                  'Request submitted'
                )
                `,
                        [requestId, existing.submitted_at]
                    )

                    return getAdjustmentRequestByIdForApi(client, requestId)
                })

                return res.json({
                    request: mapAdjustmentRequestRow(request),
                    revoked: true,
                })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.get('/me/overtime-requests', requireAuth, async (req, res) => {
        const from = req.query.from
        const to = req.query.to

        if (typeof from === 'string' && !isoDateRegex.test(from)) {
            return res
                .status(400)
                .json({ error: 'Invalid from date. Use YYYY-MM-DD' })
        }
        if (typeof to === 'string' && !isoDateRegex.test(to)) {
            return res
                .status(400)
                .json({ error: 'Invalid to date. Use YYYY-MM-DD' })
        }

        try {
            const resolvedEmployeeId = await ensureEmployeeLinkForUser(
                req.auth.userId
            )
            if (!resolvedEmployeeId) {
                return res.status(404).json({
                    error: 'No employee profile is linked to this account yet.',
                })
            }

            const requests = await withRlsContext(req.auth, async client => {
                const params = [resolvedEmployeeId, 'home-overtime']
                const where = []

                if (typeof from === 'string') {
                    params.push(from)
                    where.push(`r.request_date >= $${params.length}::date`)
                }

                if (typeof to === 'string') {
                    params.push(to)
                    where.push(`r.request_date <= $${params.length}::date`)
                }

                const dateFilterSql = where.length
                    ? `AND ${where.join(' AND ')}`
                    : ''

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
                    ORDER BY lg.logged_at ASC
                  ) AS items
                  FROM app.adjustment_request_logs lg
                  WHERE lg.request_id = r.request_id
                ) l ON TRUE
                WHERE r.employee_id = $1::text
                  AND r.source_page = $2::text
                  ${dateFilterSql}
                ORDER BY r.request_date DESC, r.submitted_at DESC
                LIMIT 300
                `,
                    params
                )

                return result.rows
            })

            return res.json({
                requests: requests.map(mapOvertimeRequestRow),
            })
        } catch (error) {
            return res.status(400).json({ error: error.message })
        }
    })

    app.post('/me/overtime-requests', requireAuth, async (req, res) => {
        const parsed = overtimeRequestCreateSchema.safeParse(req.body)
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.flatten() })
        }

        const payload = parsed.data
        const totalMinutes = computeTotalWorkDurationMinutes(
            payload.startTime,
            payload.endTime,
            0
        )
        if (totalMinutes == null) {
            return res.status(400).json({
                error: 'Invalid OT duration. Ensure endTime is later than startTime.',
            })
        }

        try {
            const resolvedEmployeeId = await ensureEmployeeLinkForUser(
                req.auth.userId
            )
            if (!resolvedEmployeeId) {
                return res.status(404).json({
                    error: 'No employee profile is linked to this account yet.',
                })
            }

            const request = await withRlsContext(req.auth, async client => {
                const schedule = await getWorkingScheduleForDate(
                    client,
                    resolvedEmployeeId,
                    payload.date
                )
                const overtimeValidationError =
                    validateOvertimeOutsideWorkingHours({
                        startTime: payload.startTime,
                        endTime: payload.endTime,
                        schedule,
                    })
                if (overtimeValidationError) {
                    throw new Error(overtimeValidationError)
                }

                const duplicateResult = await client.query(
                    `
                SELECT request_id, status, submitted_at
                FROM app.attendance_adjustment_requests
                WHERE employee_id = $1::text
                  AND request_date = $2::date
                  AND source_page = 'home-overtime'
                  AND status <> 'cancelled'::app.request_status
                LIMIT 1
                `,
                    [resolvedEmployeeId, payload.date]
                )

                const normalizedPurpose = payload.purpose.trim()
                const message = `Purpose: ${normalizedPurpose}`
                const submittedLogReason = buildOvertimeLogReason({
                    actionLabel: 'Overtime request submitted',
                    startTime: payload.startTime,
                    endTime: payload.endTime,
                    totalMinutes,
                    purpose: normalizedPurpose,
                })

                if (duplicateResult.rowCount > 0) {
                    const existingRequest = duplicateResult.rows[0]
                    if (existingRequest.status === 'approved') {
                        throw new Error(
                            'An approved overtime request already exists for this date. Revoke it first.'
                        )
                    }

                    const existingRequestId = existingRequest.request_id

                    await client.query(
                        `
                  UPDATE app.attendance_adjustment_requests
                  SET
                    request_date = $1::date,
                    shift_date_from = $2::date,
                    shift_date_to = $3::date,
                    clock_in_time = $4::text,
                    clock_out_time = $5::text,
                    reason = 'Missing logs'::app.adjustment_reason,
                    break_duration_minutes = 0,
                    total_work_duration_minutes = $6::integer,
                    message = $7::text,
                    status = 'pending'::app.request_status,
                    approved_by = NULL,
                    approved_at = NULL,
                    denied_reason = NULL
                  WHERE request_id = $8::text
                  `,
                        [
                            payload.date,
                            payload.date,
                            payload.date,
                            payload.startTime,
                            payload.endTime,
                            totalMinutes,
                            message,
                            existingRequestId,
                        ]
                    )

                    await client.query(
                        `DELETE FROM app.adjustment_request_attachments WHERE request_id = $1::text`,
                        [existingRequestId]
                    )

                    const attachments = Array.isArray(payload.attachments)
                        ? payload.attachments
                        : []
                    for (const fileName of attachments) {
                        await client.query(
                            `INSERT INTO app.adjustment_request_attachments (request_id, file_name) VALUES ($1::text, $2::text)`,
                            [existingRequestId, fileName]
                        )
                    }

                    await client.query(
                        `DELETE FROM app.adjustment_request_logs WHERE request_id = $1::text`,
                        [existingRequestId]
                    )

                    await client.query(
                        `
                  INSERT INTO app.adjustment_request_logs (request_id, status, logged_at, approved_by, reason)
                  VALUES ($1::text, 'pending'::app.request_status, COALESCE($2::timestamptz, NOW()), NULL, $3::text)
                  `,
                        [
                            existingRequestId,
                            existingRequest.submitted_at,
                            submittedLogReason,
                        ]
                    )

                    return getAdjustmentRequestByIdForApi(
                        client,
                        existingRequestId
                    )
                }

                const employeeResult = await client.query(
                    `
                SELECT
                  e.first_name,
                  e.last_name,
                  COALESCE(jp.name, e.position, 'Employee') AS position,
                  COALESCE(d.name, 'N/A') AS department
                FROM app.employees e
                LEFT JOIN app.job_positions jp ON jp.position_id = e.position_id
                LEFT JOIN app.departments d ON d.department_id = e.department_id
                WHERE e.employee_id = $1::text
                LIMIT 1
                `,
                    [resolvedEmployeeId]
                )

                const employeeRow = employeeResult.rows[0] ?? null
                const employeeName = employeeRow
                    ? `${employeeRow.first_name ?? ''} ${employeeRow.last_name ?? ''}`.trim() ||
                      'Employee'
                    : 'Employee'

                const requestId = `ot-home-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

                await client.query(
                    `
                INSERT INTO app.attendance_adjustment_requests (
                  request_id,
                  employee_id,
                  employee_name,
                  position,
                  department,
                  request_date,
                  shift_date_from,
                  shift_date_to,
                  clock_in_time,
                  clock_out_time,
                  reason,
                  break_duration_minutes,
                  total_work_duration_minutes,
                  message,
                  status,
                  submitted_at,
                  source_page
                )
                VALUES (
                  $1::text,
                  $2::text,
                  $3::text,
                  $4::text,
                  $5::text,
                  $6::date,
                  $7::date,
                  $8::date,
                  $9::text,
                  $10::text,
                  'Missing logs'::app.adjustment_reason,
                  0,
                  $11::integer,
                  $12::text,
                  'pending'::app.request_status,
                  NOW(),
                  'home-overtime'
                )
                `,
                    [
                        requestId,
                        resolvedEmployeeId,
                        employeeName,
                        employeeRow?.position ?? 'Employee',
                        employeeRow?.department ?? 'N/A',
                        payload.date,
                        payload.date,
                        payload.date,
                        payload.startTime,
                        payload.endTime,
                        totalMinutes,
                        message,
                    ]
                )

                const attachments = Array.isArray(payload.attachments)
                    ? payload.attachments
                    : []
                for (const fileName of attachments) {
                    await client.query(
                        `INSERT INTO app.adjustment_request_attachments (request_id, file_name) VALUES ($1::text, $2::text)`,
                        [requestId, fileName]
                    )
                }

                await client.query(
                    `
                INSERT INTO app.adjustment_request_logs (request_id, status, logged_at, approved_by, reason)
                VALUES ($1::text, 'pending'::app.request_status, NOW(), NULL, $2::text)
                `,
                    [requestId, submittedLogReason]
                )

                return getAdjustmentRequestByIdForApi(client, requestId)
            })

            return res
                .status(201)
                .json({ request: mapOvertimeRequestRow(request) })
        } catch (error) {
            return res.status(400).json({ error: error.message })
        }
    })

    app.put(
        '/me/overtime-requests/:requestId',
        requireAuth,
        async (req, res) => {
            const requestId = String(req.params.requestId || '').trim()
            if (!requestId) {
                return res.status(400).json({ error: 'Invalid requestId' })
            }

            const parsed = overtimeRequestUpdateSchema.safeParse(req.body)
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.flatten() })
            }

            const payload = parsed.data
            const totalMinutes = computeTotalWorkDurationMinutes(
                payload.startTime,
                payload.endTime,
                0
            )
            if (totalMinutes == null) {
                return res.status(400).json({
                    error: 'Invalid OT duration. Ensure endTime is later than startTime.',
                })
            }

            try {
                const resolvedEmployeeId = await ensureEmployeeLinkForUser(
                    req.auth.userId
                )
                if (!resolvedEmployeeId) {
                    return res.status(404).json({
                        error: 'No employee profile is linked to this account yet.',
                    })
                }

                const request = await withRlsContext(req.auth, async client => {
                    const existingResult = await client.query(
                        `
                SELECT request_id, status, submitted_at
                FROM app.attendance_adjustment_requests
                WHERE request_id = $1::text
                  AND employee_id = $2::text
                  AND source_page = 'home-overtime'
                LIMIT 1
                `,
                        [requestId, resolvedEmployeeId]
                    )

                    if (existingResult.rowCount === 0) {
                        throw new Error('Overtime request not found')
                    }

                    const existing = existingResult.rows[0]
                    if (existing.status === 'approved') {
                        throw new Error(
                            'Approved overtime requests must be revoked before updating'
                        )
                    }

                    if (existing.status === 'cancelled') {
                        throw new Error(
                            'Cancelled overtime requests cannot be updated'
                        )
                    }

                    const schedule = await getWorkingScheduleForDate(
                        client,
                        resolvedEmployeeId,
                        payload.date
                    )
                    const overtimeValidationError =
                        validateOvertimeOutsideWorkingHours({
                            startTime: payload.startTime,
                            endTime: payload.endTime,
                            schedule,
                        })
                    if (overtimeValidationError) {
                        throw new Error(overtimeValidationError)
                    }

                    const normalizedPurpose = payload.purpose.trim()
                    const message = `Purpose: ${normalizedPurpose}`
                    const updatedLogReason = buildOvertimeLogReason({
                        actionLabel: 'Overtime request updated by employee',
                        startTime: payload.startTime,
                        endTime: payload.endTime,
                        totalMinutes,
                        purpose: normalizedPurpose,
                    })

                    await client.query(
                        `
                UPDATE app.attendance_adjustment_requests
                SET
                  request_date = $1::date,
                  shift_date_from = $2::date,
                  shift_date_to = $3::date,
                  clock_in_time = $4::text,
                  clock_out_time = $5::text,
                  reason = 'Missing logs'::app.adjustment_reason,
                  break_duration_minutes = 0,
                  total_work_duration_minutes = $6::integer,
                  message = $7::text,
                  status = 'pending'::app.request_status,
                  approved_by = NULL,
                  approved_at = NULL,
                  denied_reason = NULL
                WHERE request_id = $8::text
                `,
                        [
                            payload.date,
                            payload.date,
                            payload.date,
                            payload.startTime,
                            payload.endTime,
                            totalMinutes,
                            message,
                            requestId,
                        ]
                    )

                    await client.query(
                        `DELETE FROM app.adjustment_request_attachments WHERE request_id = $1::text`,
                        [requestId]
                    )
                    const attachments = Array.isArray(payload.attachments)
                        ? payload.attachments
                        : []
                    for (const fileName of attachments) {
                        await client.query(
                            `INSERT INTO app.adjustment_request_attachments (request_id, file_name) VALUES ($1::text, $2::text)`,
                            [requestId, fileName]
                        )
                    }

                    await client.query(
                        `DELETE FROM app.adjustment_request_logs WHERE request_id = $1::text`,
                        [requestId]
                    )
                    await client.query(
                        `
                INSERT INTO app.adjustment_request_logs (request_id, status, logged_at, approved_by, reason)
                VALUES ($1::text, 'pending'::app.request_status, COALESCE($2::timestamptz, NOW()), NULL, $3::text)
                `,
                        [requestId, existing.submitted_at, updatedLogReason]
                    )

                    return getAdjustmentRequestByIdForApi(client, requestId)
                })

                return res.json({ request: mapOvertimeRequestRow(request) })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.delete(
        '/me/overtime-requests/:requestId',
        requireAuth,
        async (req, res) => {
            const requestId = String(req.params.requestId || '').trim()
            if (!requestId) {
                return res.status(400).json({ error: 'Invalid requestId' })
            }

            try {
                const resolvedEmployeeId = await ensureEmployeeLinkForUser(
                    req.auth.userId
                )
                if (!resolvedEmployeeId) {
                    return res.status(404).json({
                        error: 'No employee profile is linked to this account yet.',
                    })
                }

                await withRlsContext(req.auth, async client => {
                    const existingResult = await client.query(
                        `
                SELECT request_id, status
                FROM app.attendance_adjustment_requests
                WHERE request_id = $1::text
                  AND employee_id = $2::text
                  AND source_page = 'home-overtime'
                LIMIT 1
                `,
                        [requestId, resolvedEmployeeId]
                    )

                    if (existingResult.rowCount === 0) {
                        throw new Error('Overtime request not found')
                    }

                    const existing = existingResult.rows[0]
                    if (existing.status === 'approved') {
                        throw new Error(
                            'Approved overtime requests cannot be deleted. Revoke first.'
                        )
                    }

                    await client.query(
                        `DELETE FROM app.attendance_adjustment_requests WHERE request_id = $1::text`,
                        [requestId]
                    )
                })

                return res.json({ deleted: true, requestId })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.post(
        '/me/overtime-requests/:requestId/revoke',
        requireAuth,
        async (req, res) => {
            const requestId = String(req.params.requestId || '').trim()
            if (!requestId) {
                return res.status(400).json({ error: 'Invalid requestId' })
            }

            try {
                const resolvedEmployeeId = await ensureEmployeeLinkForUser(
                    req.auth.userId
                )
                if (!resolvedEmployeeId) {
                    return res.status(404).json({
                        error: 'No employee profile is linked to this account yet.',
                    })
                }

                const request = await withRlsContext(req.auth, async client => {
                    const existingResult = await client.query(
                        `
                SELECT
                  request_id,
                  status,
                  submitted_at,
                  clock_in_time,
                  clock_out_time,
                  total_work_duration_minutes,
                  message
                FROM app.attendance_adjustment_requests
                WHERE request_id = $1::text
                  AND employee_id = $2::text
                  AND source_page = 'home-overtime'
                LIMIT 1
                `,
                        [requestId, resolvedEmployeeId]
                    )

                    if (existingResult.rowCount === 0) {
                        throw new Error('Overtime request not found')
                    }

                    const existing = existingResult.rows[0]
                    if (existing.status !== 'approved') {
                        throw new Error(
                            'Only approved overtime requests can be revoked'
                        )
                    }

                    const revokedLogReason = buildOvertimeLogReason({
                        actionLabel: 'Overtime approval revoked by employee',
                        startTime: String(existing.clock_in_time ?? ''),
                        endTime: String(existing.clock_out_time ?? ''),
                        totalMinutes: Number(
                            existing.total_work_duration_minutes ?? 0
                        ),
                        purpose: parsePurposeFromOvertimeMessage(
                            existing.message
                        ),
                    })

                    await client.query(
                        `
                UPDATE app.attendance_adjustment_requests
                SET
                  status = 'pending'::app.request_status,
                  approved_by = NULL,
                  approved_at = NULL,
                  denied_reason = NULL
                WHERE request_id = $1::text
                `,
                        [requestId]
                    )

                    await client.query(
                        `DELETE FROM app.adjustment_request_logs WHERE request_id = $1::text`,
                        [requestId]
                    )
                    await client.query(
                        `
                INSERT INTO app.adjustment_request_logs (request_id, status, logged_at, approved_by, reason)
                VALUES ($1::text, 'pending'::app.request_status, COALESCE($2::timestamptz, NOW()), NULL, $3::text)
                `,
                        [requestId, existing.submitted_at, revokedLogReason]
                    )

                    return getAdjustmentRequestByIdForApi(client, requestId)
                })

                return res.json({
                    request: mapOvertimeRequestRow(request),
                    revoked: true,
                })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.get('/me/calendar', requireAuth, async (req, res) => {
        const from = req.query.from
        const to = req.query.to

        if (typeof from === 'string' && !isoDateRegex.test(from)) {
            return res
                .status(400)
                .json({ error: 'Invalid from date. Use YYYY-MM-DD' })
        }
        if (typeof to === 'string' && !isoDateRegex.test(to)) {
            return res
                .status(400)
                .json({ error: 'Invalid to date. Use YYYY-MM-DD' })
        }

        try {
            const seedResult = await seedCalendarSampleAttendanceIfEmpty(
                req.auth
            )
            const resolvedEmployeeId = await ensureEmployeeLinkForUser(
                req.auth.userId
            )
            if (!resolvedEmployeeId) {
                return res.status(404).json({
                    error: 'No employee profile is linked to this account yet.',
                })
            }

            const { startDate, endDate } = buildAttendanceSyncRange(
                typeof from === 'string' ? from : null,
                typeof to === 'string' ? to : null,
                365
            )
            await syncAbsentAttendanceForRange(
                req.auth,
                resolvedEmployeeId,
                startDate,
                endDate
            )
            await autoCloseMissedClockOuts(
                req.auth,
                resolvedEmployeeId,
                typeof from === 'string' ? from : null,
                typeof to === 'string' ? to : null
            )

            const attendanceWhere = []
            const attendanceParams = [resolvedEmployeeId]

            attendanceWhere.push(`ar.employee_id = $1::text`)
            attendanceWhere.push(
                `ar.record_type = 'actual'::app.attendance_record_type`
            )

            if (typeof from === 'string') {
                attendanceParams.push(from)
                attendanceWhere.push(
                    `ar.attendance_date >= $${attendanceParams.length}::date`
                )
            }
            if (typeof to === 'string') {
                attendanceParams.push(to)
                attendanceWhere.push(
                    `ar.attendance_date <= $${attendanceParams.length}::date`
                )
            }

            const attendanceFilterSql = attendanceWhere.length
                ? `WHERE ${attendanceWhere.join(' AND ')}`
                : ''

            const holidaysWhere = []
            const holidaysParams = []
            if (typeof from === 'string') {
                holidaysParams.push(from)
                holidaysWhere.push(
                    `h.holiday_date >= $${holidaysParams.length}::date`
                )
            }
            if (typeof to === 'string') {
                holidaysParams.push(to)
                holidaysWhere.push(
                    `h.holiday_date <= $${holidaysParams.length}::date`
                )
            }

            const holidaysFilterSql = holidaysWhere.length
                ? `WHERE ${holidaysWhere.join(' AND ')}`
                : ''

            const { attendanceRows, holidayRows } = await withRlsContext(
                req.auth,
                async client => {
                    const attendanceResult = await client.query(
                        `
                WITH attendance_dates AS (
                  SELECT DISTINCT ar.attendance_date
                  FROM app.attendance_records ar
                  ${attendanceFilterSql}
                ),
                actual_rows AS (
                  SELECT
                    ar.attendance_date,
                    ar.status,
                    ar.clock_in,
                    ar.clock_out,
                    ar.work_duration_minutes,
                    ar.late_minutes,
                    ar.total_break_duration_minutes,
                    ar.active_break_started_at
                  FROM app.attendance_records ar
                  WHERE ar.employee_id = $1::text
                    AND ar.record_type = 'actual'::app.attendance_record_type
                ),
                adjusted_rows AS (
                  SELECT
                    ar.attendance_date,
                    ar.status,
                    ar.clock_in,
                    ar.clock_out,
                    ar.work_duration_minutes,
                    ar.late_minutes,
                    ar.total_break_duration_minutes
                  FROM app.attendance_records ar
                  WHERE ar.employee_id = $1::text
                    AND ar.record_type = 'adjusted'::app.attendance_record_type
                    AND ar.approval_status = 'approved'::app.request_status
                ),
                overtime_rows AS (
                  SELECT
                    ar.attendance_date,
                    ar.work_duration_minutes
                  FROM app.attendance_records ar
                  WHERE ar.employee_id = $1::text
                    AND ar.record_type = 'overtime'::app.attendance_record_type
                    AND ar.approval_status = 'approved'::app.request_status
                ),
                latest_adjustment_requests AS (
                  SELECT DISTINCT ON (r.request_date)
                    r.request_date,
                    r.status
                  FROM app.attendance_adjustment_requests r
                  WHERE r.employee_id = $1::text
                    AND r.source_page = 'home'
                  ORDER BY r.request_date, r.submitted_at DESC, r.request_id DESC
                ),
                latest_overtime_requests AS (
                  SELECT DISTINCT ON (r.request_date)
                    r.request_date,
                    r.status
                  FROM app.attendance_adjustment_requests r
                  WHERE r.employee_id = $1::text
                    AND r.source_page = 'home-overtime'
                  ORDER BY r.request_date, r.submitted_at DESC, r.request_id DESC
                ),
                effective_rows AS (
                  SELECT
                    d.attendance_date,
                    COALESCE(adjusted_rows.status, actual_rows.status, 'absent'::app.attendance_status) AS status,
                    COALESCE(adjusted_rows.clock_in, actual_rows.clock_in) AS clock_in,
                    COALESCE(adjusted_rows.clock_out, actual_rows.clock_out) AS clock_out,
                    (COALESCE(adjusted_rows.work_duration_minutes, actual_rows.work_duration_minutes, 0)
                      + COALESCE(overtime_rows.work_duration_minutes, 0))::integer AS work_duration_minutes,
                    COALESCE(adjusted_rows.late_minutes, actual_rows.late_minutes, 0) AS late_minutes,
                    COALESCE(adjusted_rows.total_break_duration_minutes, actual_rows.total_break_duration_minutes, 0)
                      AS total_break_duration_minutes,
                    actual_rows.active_break_started_at,
                    CASE
                      WHEN adjusted_rows.attendance_date IS NOT NULL THEN 'adjusted'
                      ELSE 'actual'
                    END AS effective_record_type,
                    lar.status AS adjustment_approval_status,
                    lor.status AS overtime_approval_status
                  FROM attendance_dates d
                  LEFT JOIN actual_rows ON actual_rows.attendance_date = d.attendance_date
                  LEFT JOIN adjusted_rows ON adjusted_rows.attendance_date = d.attendance_date
                  LEFT JOIN overtime_rows ON overtime_rows.attendance_date = d.attendance_date
                  LEFT JOIN latest_adjustment_requests lar ON lar.request_date = d.attendance_date
                  LEFT JOIN latest_overtime_requests lor ON lor.request_date = d.attendance_date
                )
                SELECT
                  ar.attendance_date::text AS attendance_date,
                  ar.status,
                  ar.clock_in,
                  ar.clock_out,
                  ar.work_duration_minutes,
                  ar.late_minutes,
                  ar.effective_record_type,
                  ar.adjustment_approval_status,
                  ar.overtime_approval_status,
                  h.name AS holiday_name,
                  h.holiday_type
                FROM effective_rows ar
                LEFT JOIN LATERAL (
                  SELECT
                    string_agg(
                      concat(h1.name, ' (', h1.country_code, ')'),
                      ', '
                      ORDER BY h1.country_code, h1.name
                    ) AS name,
                    CASE
                      WHEN bool_or(h1.holiday_type = 'public'::app.holiday_type)
                        THEN 'public'::app.holiday_type
                      ELSE 'personal'::app.holiday_type
                    END AS holiday_type
                  FROM app.holidays h1
                  WHERE h1.holiday_date = ar.attendance_date
                ) h ON TRUE
                ORDER BY ar.attendance_date DESC
                LIMIT 365
                `,
                        attendanceParams
                    )

                    const holidayResult = await client.query(
                        `
                SELECT
                  h.holiday_id,
                  h.name,
                  h.holiday_date::text AS holiday_date,
                  h.holiday_type,
                  h.country_code,
                  h.country_name
                FROM app.holidays h
                ${holidaysFilterSql}
                ORDER BY h.holiday_date ASC, h.country_code ASC
                LIMIT 365
                `,
                        holidaysParams
                    )

                    return {
                        attendanceRows: attendanceResult.rows,
                        holidayRows: holidayResult.rows,
                    }
                }
            )

            const attendance = attendanceRows.map(row => ({
                date: String(row.attendance_date).slice(0, 10),
                status: row.status,
                clockIn: row.clock_in ? String(row.clock_in).slice(0, 5) : null,
                clockOut: row.clock_out
                    ? String(row.clock_out).slice(0, 5)
                    : null,
                workDurationMinutes: row.work_duration_minutes,
                lateMinutes: row.late_minutes,
                effectiveRecordType: row.effective_record_type ?? 'actual',
                adjustmentApprovalStatus:
                    row.adjustment_approval_status ?? null,
                overtimeApprovalStatus: row.overtime_approval_status ?? null,
                holidayName: row.holiday_name ?? null,
                holidayType: row.holiday_type ?? null,
            }))

            const attendanceByDate = attendance.reduce((acc, row) => {
                acc[row.date] = row.status
                return acc
            }, {})

            const today = new Date()
            today.setHours(0, 0, 0, 0)

            const holidays = holidayRows.map(row => {
                const holidayDate = new Date(
                    `${String(row.holiday_date).slice(0, 10)}T00:00:00`
                )
                const daysUntil = Math.ceil(
                    (holidayDate.getTime() - today.getTime()) /
                        (1000 * 60 * 60 * 24)
                )

                return {
                    id: row.holiday_id,
                    name: row.name,
                    date: String(row.holiday_date).slice(0, 10),
                    type: row.holiday_type,
                    countryCode: row.country_code,
                    countryName: row.country_name,
                    daysUntil,
                }
            })

            const celebrations = await withRlsContext(
                req.auth,
                async client => {
                    const celebrationRowsResult = await client.query(
                        `
                SELECT employee_id, first_name, last_name, birthday
                FROM app.employees
                WHERE birthday IS NOT NULL
                  AND employment_status = 'active'::app.employment_status
                ORDER BY first_name, last_name
                `
                    )

                    const rows = celebrationRowsResult.rows
                    const now = new Date()
                    const currentYear = now.getFullYear()
                    const endOfYear = new Date(
                        currentYear,
                        11,
                        31,
                        23,
                        59,
                        59,
                        999
                    )
                    const todayStart = new Date(now)
                    todayStart.setHours(0, 0, 0, 0)

                    const birthdayItems = rows
                        .map(row => {
                            if (!row.birthday) {
                                return null
                            }

                            const rawBirthday = new Date(String(row.birthday))
                            if (Number.isNaN(rawBirthday.getTime())) {
                                return null
                            }

                            let month = rawBirthday.getMonth()
                            let day = rawBirthday.getDate()

                            if (month === 1 && day === 29) {
                                const isLeapYear =
                                    currentYear % 4 === 0 &&
                                    (currentYear % 100 !== 0 ||
                                        currentYear % 400 === 0)
                                if (!isLeapYear) {
                                    day = 28
                                }
                            }

                            const celebrationDate = new Date(
                                currentYear,
                                month,
                                day,
                                0,
                                0,
                                0,
                                0
                            )
                            if (
                                celebrationDate < todayStart ||
                                celebrationDate > endOfYear
                            ) {
                                return null
                            }

                            const daysUntil = Math.ceil(
                                (celebrationDate.getTime() -
                                    todayStart.getTime()) /
                                    (1000 * 60 * 60 * 24)
                            )

                            return {
                                id: `birthday-${row.employee_id}-${currentYear}`,
                                type: 'birthday',
                                employeeId: row.employee_id,
                                name:
                                    `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() ||
                                    'Employee',
                                date: celebrationDate
                                    .toISOString()
                                    .slice(0, 10),
                                daysUntil,
                            }
                        })
                        .filter(Boolean)
                        .sort((a, b) => a.daysUntil - b.daysUntil)
                        .slice(0, 30)

                    return birthdayItems
                }
            )

            return res.json({
                attendance,
                attendanceByDate,
                holidays,
                celebrations,
                seeded: seedResult.seeded,
                insertedRecords: seedResult.inserted,
            })
        } catch (error) {
            return res.status(400).json({ error: error.message })
        }
    })
}
