export function registerSettingsRoutes(app, deps) {
    const {
        query,
        pool,
        requireAuth,
        requireRole,
        companyWorkingHourCreateSchema,
        companyWorkingHourBulkSchema,
        companyWorkingHourUpdateSchema,
        buildScheduleValidationError,
        isoDayByName,
        mapCompanyWorkingHourRow,
        normalizeTimeValue,
    } = deps

    app.get(
        '/settings/company-working-hours',
        requireAuth,
        requireRole('admin', 'hr_manager'),
        async (_req, res) => {
            try {
                const result = await query(
                    `
        SELECT
          working_hour_id,
          iso_day,
          day_name,
          is_working_day,
          start_time,
          end_time,
          created_at,
          updated_at
        FROM app.company_settings_working_hours
        ORDER BY iso_day ASC
        `
                )

                return res.json({
                    workingHours: result.rows.map(mapCompanyWorkingHourRow),
                })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.post(
        '/settings/company-working-hours',
        requireAuth,
        requireRole('admin', 'hr_manager'),
        async (req, res) => {
            const parsed = companyWorkingHourCreateSchema.safeParse(req.body)
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.flatten() })
            }

            const payload = parsed.data
            const normalizedInput = {
                day: payload.day,
                isWorkingDay: payload.isWorkingDay,
                startTime: payload.isWorkingDay
                    ? (payload.startTime ?? null)
                    : null,
                endTime: payload.isWorkingDay
                    ? (payload.endTime ?? null)
                    : null,
            }

            const validationError =
                buildScheduleValidationError(normalizedInput)
            if (validationError) {
                return res.status(400).json({ error: validationError })
            }

            try {
                const result = await query(
                    `
        INSERT INTO app.company_settings_working_hours (
          iso_day,
          day_name,
          is_working_day,
          start_time,
          end_time
        )
        VALUES ($1::smallint, $2::text, $3::boolean, $4::time, $5::time)
        RETURNING
          working_hour_id,
          iso_day,
          day_name,
          is_working_day,
          start_time,
          end_time,
          created_at,
          updated_at
        `,
                    [
                        isoDayByName[normalizedInput.day],
                        normalizedInput.day,
                        normalizedInput.isWorkingDay,
                        normalizedInput.startTime,
                        normalizedInput.endTime,
                    ]
                )

                return res.status(201).json({
                    workingHour: mapCompanyWorkingHourRow(result.rows[0]),
                })
            } catch (error) {
                if (error?.code === '23505') {
                    return res.status(409).json({
                        error: 'Working-hour row for this day already exists',
                    })
                }
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.put(
        '/settings/company-working-hours',
        requireAuth,
        requireRole('admin', 'hr_manager'),
        async (req, res) => {
            const parsed = companyWorkingHourBulkSchema.safeParse(req.body)
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.flatten() })
            }

            const uniqueDays = new Set()
            const normalizedDays = []

            for (const dayPayload of parsed.data.days) {
                if (uniqueDays.has(dayPayload.day)) {
                    return res
                        .status(400)
                        .json({ error: `Duplicate day: ${dayPayload.day}` })
                }

                uniqueDays.add(dayPayload.day)

                const normalized = {
                    day: dayPayload.day,
                    isWorkingDay: dayPayload.isWorkingDay,
                    startTime: dayPayload.isWorkingDay
                        ? (dayPayload.startTime ?? null)
                        : null,
                    endTime: dayPayload.isWorkingDay
                        ? (dayPayload.endTime ?? null)
                        : null,
                }

                const validationError = buildScheduleValidationError(normalized)
                if (validationError) {
                    return res
                        .status(400)
                        .json({
                            error: `${dayPayload.day}: ${validationError}`,
                        })
                }

                normalizedDays.push(normalized)
            }

            const client = await pool.connect()
            try {
                await client.query('BEGIN')

                for (const day of normalizedDays) {
                    await client.query(
                        `
          INSERT INTO app.company_settings_working_hours (
            iso_day,
            day_name,
            is_working_day,
            start_time,
            end_time
          )
          VALUES ($1::smallint, $2::text, $3::boolean, $4::time, $5::time)
          ON CONFLICT (iso_day) DO UPDATE
          SET
            day_name = EXCLUDED.day_name,
            is_working_day = EXCLUDED.is_working_day,
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            updated_at = NOW()
          `,
                        [
                            isoDayByName[day.day],
                            day.day,
                            day.isWorkingDay,
                            day.startTime,
                            day.endTime,
                        ]
                    )
                }

                const result = await client.query(
                    `
        SELECT
          working_hour_id,
          iso_day,
          day_name,
          is_working_day,
          start_time,
          end_time,
          created_at,
          updated_at
        FROM app.company_settings_working_hours
        ORDER BY iso_day ASC
        `
                )

                await client.query('COMMIT')
                return res.json({
                    workingHours: result.rows.map(mapCompanyWorkingHourRow),
                })
            } catch (error) {
                await client.query('ROLLBACK')
                return res.status(400).json({ error: error.message })
            } finally {
                client.release()
            }
        }
    )

    app.put(
        '/settings/company-working-hours/:workingHourId',
        requireAuth,
        requireRole('admin', 'hr_manager'),
        async (req, res) => {
            const workingHourId = Number(req.params.workingHourId)
            if (!Number.isInteger(workingHourId) || workingHourId <= 0) {
                return res.status(400).json({ error: 'Invalid workingHourId' })
            }

            const parsed = companyWorkingHourUpdateSchema.safeParse(req.body)
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.flatten() })
            }

            try {
                const existingResult = await query(
                    `
        SELECT
          working_hour_id,
          iso_day,
          day_name,
          is_working_day,
          start_time,
          end_time,
          created_at,
          updated_at
        FROM app.company_settings_working_hours
        WHERE working_hour_id = $1::bigint
        `,
                    [workingHourId]
                )

                if (existingResult.rowCount === 0) {
                    return res
                        .status(404)
                        .json({ error: 'Working-hour row not found' })
                }

                const existing = existingResult.rows[0]
                const payload = parsed.data

                const resolvedDay = payload.day ?? existing.day_name
                const resolvedIsWorkingDay =
                    typeof payload.isWorkingDay === 'boolean'
                        ? payload.isWorkingDay
                        : existing.is_working_day

                let resolvedStartTime = Object.prototype.hasOwnProperty.call(
                    payload,
                    'startTime'
                )
                    ? payload.startTime
                    : normalizeTimeValue(existing.start_time)
                let resolvedEndTime = Object.prototype.hasOwnProperty.call(
                    payload,
                    'endTime'
                )
                    ? payload.endTime
                    : normalizeTimeValue(existing.end_time)

                if (!resolvedIsWorkingDay) {
                    resolvedStartTime = null
                    resolvedEndTime = null
                }

                const validationError = buildScheduleValidationError({
                    day: resolvedDay,
                    isWorkingDay: resolvedIsWorkingDay,
                    startTime: resolvedStartTime,
                    endTime: resolvedEndTime,
                })

                if (validationError) {
                    return res.status(400).json({ error: validationError })
                }

                const updateResult = await query(
                    `
        UPDATE app.company_settings_working_hours
        SET
          iso_day = $1::smallint,
          day_name = $2::text,
          is_working_day = $3::boolean,
          start_time = $4::time,
          end_time = $5::time,
          updated_at = NOW()
        WHERE working_hour_id = $6::bigint
        RETURNING
          working_hour_id,
          iso_day,
          day_name,
          is_working_day,
          start_time,
          end_time,
          created_at,
          updated_at
        `,
                    [
                        isoDayByName[resolvedDay],
                        resolvedDay,
                        resolvedIsWorkingDay,
                        resolvedStartTime,
                        resolvedEndTime,
                        workingHourId,
                    ]
                )

                return res.json({
                    workingHour: mapCompanyWorkingHourRow(updateResult.rows[0]),
                })
            } catch (error) {
                if (error?.code === '23505') {
                    return res.status(409).json({
                        error: 'Working-hour row for this day already exists',
                    })
                }
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.delete(
        '/settings/company-working-hours/:workingHourId',
        requireAuth,
        requireRole('admin', 'hr_manager'),
        async (req, res) => {
            const workingHourId = Number(req.params.workingHourId)
            if (!Number.isInteger(workingHourId) || workingHourId <= 0) {
                return res.status(400).json({ error: 'Invalid workingHourId' })
            }

            try {
                const result = await query(
                    `
        DELETE FROM app.company_settings_working_hours
        WHERE working_hour_id = $1::bigint
        RETURNING
          working_hour_id,
          iso_day,
          day_name,
          is_working_day,
          start_time,
          end_time,
          created_at,
          updated_at
        `,
                    [workingHourId]
                )

                if (result.rowCount === 0) {
                    return res
                        .status(404)
                        .json({ error: 'Working-hour row not found' })
                }

                return res.json({
                    deleted: true,
                    workingHour: mapCompanyWorkingHourRow(result.rows[0]),
                })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )
}
