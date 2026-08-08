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

    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/
    const holidayCountryNameByCode = {
        PH: 'Philippines',
        AU: 'Australia',
        US: 'United States',
    }

    const mapHolidayRow = row => ({
        id: row.holiday_id,
        name: row.name,
        date: String(row.holiday_date).slice(0, 10),
        type: row.holiday_type,
        countryCode: row.country_code,
        countryName: row.country_name,
        subdivisionCode: row.subdivision_code ?? undefined,
        subdivisionName: row.subdivision_name ?? undefined,
        scope: row.scope === 'subdivision' ? 'subdivision' : 'national',
    })

    const normalizeHolidayPayload = payload => {
        const name = String(payload?.name ?? '').trim()
        const date = String(payload?.date ?? '').trim()
        const rawType = String(payload?.type ?? 'public')
            .trim()
            .toLowerCase()
        const type = rawType === 'personal' ? 'personal' : 'public'
        const rawScope = String(payload?.scope ?? 'national')
            .trim()
            .toLowerCase()
        const scope = rawScope === 'subdivision' ? 'subdivision' : 'national'
        const countryCode = String(payload?.countryCode ?? 'PH')
            .trim()
            .toUpperCase()
        const countryNameInput = String(payload?.countryName ?? '').trim()
        const subdivisionCode = String(payload?.subdivisionCode ?? '')
            .trim()
            .toUpperCase()
        const subdivisionName = String(payload?.subdivisionName ?? '').trim()

        if (!name) {
            return { error: 'Holiday name is required' }
        }
        if (!isoDateRegex.test(date)) {
            return { error: 'Holiday date must be in YYYY-MM-DD format' }
        }
        if (!/^[A-Z]{2}$/.test(countryCode)) {
            return { error: 'countryCode must be a 2-letter ISO code' }
        }
        if (scope === 'subdivision' && !subdivisionCode) {
            return {
                error: 'subdivisionCode is required for subdivision holidays',
            }
        }

        const countryName =
            countryNameInput ||
            holidayCountryNameByCode[countryCode] ||
            countryCode

        const resolvedSubdivisionName =
            scope === 'subdivision' ? subdivisionName || subdivisionCode : null

        return {
            value: {
                name,
                date,
                type,
                scope,
                countryCode,
                countryName,
                subdivisionCode:
                    scope === 'subdivision' ? subdivisionCode : null,
                subdivisionName: resolvedSubdivisionName,
            },
        }
    }

    const buildHolidayId = ({
        countryCode,
        date,
        name,
        scope,
        subdivisionCode,
    }) => {
        const slug = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 48)
        const suffix = Math.random().toString(36).slice(2, 8)
        if (scope === 'subdivision' && subdivisionCode) {
            return `custom-subdiv-${countryCode.toLowerCase()}-${subdivisionCode.toLowerCase()}-${date}-${slug || 'holiday'}-${suffix}`
        }
        return `custom-${countryCode.toLowerCase()}-${date}-${slug || 'holiday'}-${suffix}`
    }

    const holidaySelectSql = `
      SELECT
        h.holiday_id,
        h.name,
        h.holiday_date,
        h.holiday_type,
        h.country_code,
        h.country_name,
        NULL::text AS subdivision_code,
        NULL::text AS subdivision_name,
        'national'::text AS scope
      FROM app.holidays h
      UNION ALL
      SELECT
        sh.subdivision_holiday_id AS holiday_id,
        sh.name,
        sh.holiday_date,
        sh.holiday_type,
        sh.country_code,
        sh.country_name,
        sh.subdivision_code,
        sh.subdivision_name,
        'subdivision'::text AS scope
      FROM app.holiday_subdivision_holidays sh
    `

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
                    return res.status(400).json({
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

    app.get(
        '/settings/holidays',
        requireAuth,
        requireRole('admin'),
        async (req, res) => {
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

            const whereParts = []
            const params = []
            if (typeof from === 'string') {
                params.push(from)
                whereParts.push(`holiday_date >= $${params.length}::date`)
            }
            if (typeof to === 'string') {
                params.push(to)
                whereParts.push(`holiday_date <= $${params.length}::date`)
            }

            const whereSql = whereParts.length
                ? `WHERE ${whereParts.join(' AND ')}`
                : ''

            try {
                const result = await query(
                    `
                SELECT *
                FROM (${holidaySelectSql}) h
                ${whereSql}
                ORDER BY holiday_date ASC, country_code ASC, subdivision_code ASC NULLS FIRST, name ASC
                LIMIT 3000
                `,
                    params
                )

                return res.json({ holidays: result.rows.map(mapHolidayRow) })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.post(
        '/settings/holidays',
        requireAuth,
        requireRole('admin'),
        async (req, res) => {
            const normalized = normalizeHolidayPayload(req.body)
            if (normalized.error) {
                return res.status(400).json({ error: normalized.error })
            }

            const holiday = normalized.value
            const holidayId = buildHolidayId(holiday)

            try {
                const result =
                    holiday.scope === 'subdivision'
                        ? await query(
                              `
                INSERT INTO app.holiday_subdivision_holidays (
                    subdivision_holiday_id,
                    name,
                    holiday_date,
                    country_code,
                    country_name,
                    subdivision_code,
                    subdivision_name,
                    holiday_type,
                    days_until
                )
                VALUES ($1::text, $2::text, $3::date, $4::text, $5::text, $6::text, $7::text, $8::app.holiday_type, NULL)
                RETURNING
                    subdivision_holiday_id AS holiday_id,
                    name,
                    holiday_date,
                    holiday_type,
                    country_code,
                    country_name,
                    subdivision_code,
                    subdivision_name,
                    'subdivision'::text AS scope
                `,
                              [
                                  holidayId,
                                  holiday.name,
                                  holiday.date,
                                  holiday.countryCode,
                                  holiday.countryName,
                                  holiday.subdivisionCode,
                                  holiday.subdivisionName,
                                  holiday.type,
                              ]
                          )
                        : await query(
                              `
                INSERT INTO app.holidays (
                    holiday_id,
                    name,
                    holiday_date,
                    holiday_type,
                    country_code,
                    country_name,
                    days_until
                )
                VALUES ($1::text, $2::text, $3::date, $4::app.holiday_type, $5::text, $6::text, NULL)
                RETURNING
                    holiday_id,
                    name,
                    holiday_date,
                    holiday_type,
                    country_code,
                    country_name,
                    NULL::text AS subdivision_code,
                    NULL::text AS subdivision_name,
                    'national'::text AS scope
                `,
                              [
                                  holidayId,
                                  holiday.name,
                                  holiday.date,
                                  holiday.type,
                                  holiday.countryCode,
                                  holiday.countryName,
                              ]
                          )

                return res.status(201).json({
                    holiday: mapHolidayRow(result.rows[0]),
                })
            } catch (error) {
                if (error?.code === '23505') {
                    return res.status(409).json({
                        error: 'A holiday for this country and date already exists',
                    })
                }
                return res.status(400).json({ error: error.message })
            }
        }
    )

    app.post(
        '/settings/holidays/bulk',
        requireAuth,
        requireRole('admin'),
        async (req, res) => {
            const entries = Array.isArray(req.body?.holidays)
                ? req.body.holidays
                : null
            if (!entries || entries.length === 0) {
                return res
                    .status(400)
                    .json({ error: 'holidays must be a non-empty array' })
            }

            const normalizedEntries = []
            for (const entry of entries) {
                const normalized = normalizeHolidayPayload(entry)
                if (normalized.error) {
                    return res.status(400).json({ error: normalized.error })
                }
                normalizedEntries.push(normalized.value)
            }

            const client = await pool.connect()
            try {
                await client.query('BEGIN')

                for (const holiday of normalizedEntries) {
                    if (holiday.scope === 'subdivision') {
                        await client.query(
                            `
                        INSERT INTO app.holiday_subdivision_holidays (
                            subdivision_holiday_id,
                            name,
                            holiday_date,
                            country_code,
                            country_name,
                            subdivision_code,
                            subdivision_name,
                            holiday_type,
                            days_until
                        )
                        VALUES ($1::text, $2::text, $3::date, $4::text, $5::text, $6::text, $7::text, $8::app.holiday_type, NULL)
                        ON CONFLICT (country_code, subdivision_code, holiday_date, name) DO UPDATE
                        SET
                            country_name = EXCLUDED.country_name,
                            subdivision_name = EXCLUDED.subdivision_name,
                            holiday_type = EXCLUDED.holiday_type,
                            days_until = NULL,
                            updated_at = NOW()
                        `,
                            [
                                buildHolidayId(holiday),
                                holiday.name,
                                holiday.date,
                                holiday.countryCode,
                                holiday.countryName,
                                holiday.subdivisionCode,
                                holiday.subdivisionName,
                                holiday.type,
                            ]
                        )
                        continue
                    }

                    await client.query(
                        `
            INSERT INTO app.holidays (
              holiday_id,
              name,
              holiday_date,
              holiday_type,
              country_code,
              country_name,
              days_until
            )
            VALUES ($1::text, $2::text, $3::date, $4::app.holiday_type, $5::text, $6::text, NULL)
            ON CONFLICT (country_code, holiday_date) DO UPDATE
            SET
              name = EXCLUDED.name,
              holiday_type = EXCLUDED.holiday_type,
              country_name = EXCLUDED.country_name
            `,
                        [
                            buildHolidayId(holiday),
                            holiday.name,
                            holiday.date,
                            holiday.type,
                            holiday.countryCode,
                            holiday.countryName,
                        ]
                    )
                }

                const result = await client.query(
                    `
                    SELECT *
                    FROM (${holidaySelectSql}) h
                    ORDER BY holiday_date ASC, country_code ASC, subdivision_code ASC NULLS FIRST, name ASC
                    LIMIT 3000
          `
                )

                await client.query('COMMIT')

                return res.json({
                    inserted: normalizedEntries.length,
                    holidays: result.rows.map(mapHolidayRow),
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
        '/settings/holidays/:holidayId',
        requireAuth,
        requireRole('admin'),
        async (req, res) => {
            const holidayId = String(req.params.holidayId ?? '').trim()
            if (!holidayId) {
                return res.status(400).json({ error: 'Invalid holidayId' })
            }

            const normalized = normalizeHolidayPayload(req.body)
            if (normalized.error) {
                return res.status(400).json({ error: normalized.error })
            }

            const holiday = normalized.value

            const client = await pool.connect()
            try {
                await client.query('BEGIN')

                const nationalResult = await client.query(
                    `
        UPDATE app.holidays
        SET
          name = $1::text,
          holiday_date = $2::date,
          holiday_type = $3::app.holiday_type,
          country_code = $4::text,
          country_name = $5::text,
          days_until = NULL
        WHERE holiday_id = $6::text
        RETURNING
          holiday_id,
          name,
          holiday_date,
          holiday_type,
          country_code,
          country_name,
          NULL::text AS subdivision_code,
          NULL::text AS subdivision_name,
          'national'::text AS scope
        `,
                    [
                        holiday.name,
                        holiday.date,
                        holiday.type,
                        holiday.countryCode,
                        holiday.countryName,
                        holidayId,
                    ]
                )

                if (nationalResult.rowCount > 0) {
                    await client.query('COMMIT')
                    return res.json({
                        holiday: mapHolidayRow(nationalResult.rows[0]),
                    })
                }

                const subdivisionResult = await client.query(
                    `
        UPDATE app.holiday_subdivision_holidays
        SET
          name = $1::text,
          holiday_date = $2::date,
          country_code = $3::text,
          country_name = $4::text,
          subdivision_code = $5::text,
          subdivision_name = $6::text,
          holiday_type = $7::app.holiday_type,
          days_until = NULL,
          updated_at = NOW()
        WHERE subdivision_holiday_id = $8::text
        RETURNING
          subdivision_holiday_id AS holiday_id,
          name,
          holiday_date,
          holiday_type,
          country_code,
          country_name,
          subdivision_code,
          subdivision_name,
          'subdivision'::text AS scope
        `,
                    [
                        holiday.name,
                        holiday.date,
                        holiday.countryCode,
                        holiday.countryName,
                        holiday.subdivisionCode,
                        holiday.subdivisionName,
                        holiday.type,
                        holidayId,
                    ]
                )

                if (subdivisionResult.rowCount === 0) {
                    await client.query('ROLLBACK')
                    return res.status(404).json({ error: 'Holiday not found' })
                }

                await client.query('COMMIT')
                return res.json({
                    holiday: mapHolidayRow(subdivisionResult.rows[0]),
                })
            } catch (error) {
                await client.query('ROLLBACK')
                if (error?.code === '23505') {
                    return res.status(409).json({
                        error: 'A holiday for this country and date already exists',
                    })
                }
                return res.status(400).json({ error: error.message })
            } finally {
                client.release()
            }
        }
    )

    app.delete(
        '/settings/holidays/:holidayId',
        requireAuth,
        requireRole('admin'),
        async (req, res) => {
            const holidayId = String(req.params.holidayId ?? '').trim()
            if (!holidayId) {
                return res.status(400).json({ error: 'Invalid holidayId' })
            }

            const client = await pool.connect()
            try {
                const nationalDelete = await client.query(
                    `
        DELETE FROM app.holidays
        WHERE holiday_id = $1::text
        RETURNING
          holiday_id,
          name,
          holiday_date,
          holiday_type,
          country_code,
          country_name,
          NULL::text AS subdivision_code,
          NULL::text AS subdivision_name,
          'national'::text AS scope
        `,
                    [holidayId]
                )

                if (nationalDelete.rowCount > 0) {
                    return res.json({
                        deleted: true,
                        holiday: mapHolidayRow(nationalDelete.rows[0]),
                    })
                }

                const subdivisionDelete = await client.query(
                    `
        DELETE FROM app.holiday_subdivision_holidays
        WHERE subdivision_holiday_id = $1::text
        RETURNING
          subdivision_holiday_id AS holiday_id,
          name,
          holiday_date,
          holiday_type,
          country_code,
          country_name,
          subdivision_code,
          subdivision_name,
          'subdivision'::text AS scope
        `,
                    [holidayId]
                )

                if (subdivisionDelete.rowCount === 0) {
                    return res.status(404).json({ error: 'Holiday not found' })
                }

                return res.json({
                    deleted: true,
                    holiday: mapHolidayRow(subdivisionDelete.rows[0]),
                })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            } finally {
                client.release()
            }
        }
    )
}
