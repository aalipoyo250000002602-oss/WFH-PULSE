export function registerMeProfileRoutes(app, deps) {
    const {
        requireAuth,
        query,
        pool,
        selfProfileUpdateSchema,
        ensureEmployeeLinkForUser,
        mapSecurityPreferenceRow,
        mapPasswordActivityRow,
        securityPreferenceCreateSchema,
        securityPreferenceUpdateSchema,
        updatePasswordSchema,
        getPasswordValidationError,
    } = deps

        app.get('/me/profile', requireAuth, async (req, res) => {
            try {
                const resolvedEmployeeId = await ensureEmployeeLinkForUser(
                    req.auth.userId
                )
                if (!resolvedEmployeeId) {
                    return res.status(404).json({
                        error: 'No employee profile is linked to this account yet. Please contact HR/Admin.',
                    })
                }
        
                const result = await query(
                    `
              SELECT
                e.employee_id,
                e.employee_code,
                e.first_name,
                e.last_name,
                e.email,
                e.department_id,
                d.name AS department,
                e.position_id,
                COALESCE(jp.name, e.position) AS position,
                e.attendance_status,
                e.employment_status,
                e.employment_type,
                e.phone,
                e.join_date,
                e.birthday,
                e.gender,
                e.nationality,
                e.marital_status,
                e.address,
                e.profile_picture_url,
                pp.sss,
                pp.tin,
                pp.phil_health,
                pp.pag_ibig
              FROM app.employees e
              LEFT JOIN app.departments d ON d.department_id = e.department_id
              LEFT JOIN app.job_positions jp ON jp.position_id = e.position_id
              LEFT JOIN app.payroll_profiles pp ON pp.employee_id = e.employee_id
              WHERE e.employee_id = $1::text
              `,
                    [resolvedEmployeeId]
                )
        
                return res.json({ profile: result.rows[0] ?? null })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        })
        
        app.patch('/me/profile', requireAuth, async (req, res) => {
            const parsed = selfProfileUpdateSchema.safeParse(req.body)
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.flatten() })
            }
        
            const payload = parsed.data
            const resolvedEmployeeId = await ensureEmployeeLinkForUser(req.auth.userId)
            if (!resolvedEmployeeId) {
                return res.status(404).json({
                    error: 'No employee profile is linked to this account yet. Please contact HR/Admin.',
                })
            }
        
            const employeeAssignments = []
            const employeeParams = []
            const payrollAssignments = []
            const payrollParams = []
        
            const employeeFieldMap = {
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
                joinDate: 'join_date',
                profilePictureUrl: 'profile_picture_url',
            }
        
            const payrollFieldMap = {
                sssNumber: 'sss',
                tinNumber: 'tin',
                philhealthNumber: 'phil_health',
                pagibigNumber: 'pag_ibig',
            }
        
            for (const [jsonKey, dbColumn] of Object.entries(employeeFieldMap)) {
                if (Object.prototype.hasOwnProperty.call(payload, jsonKey)) {
                    employeeParams.push(payload[jsonKey])
                    employeeAssignments.push(`${dbColumn} = $${employeeParams.length}`)
                }
            }
        
            for (const [jsonKey, dbColumn] of Object.entries(payrollFieldMap)) {
                if (Object.prototype.hasOwnProperty.call(payload, jsonKey)) {
                    payrollParams.push(payload[jsonKey])
                    payrollAssignments.push(`${dbColumn} = $${payrollParams.length}`)
                }
            }
        
            try {
                const client = await pool.connect()
                try {
                    await client.query('BEGIN')
                    await client.query("SELECT set_config('app.user_id', $1, true)", [
                        String(req.auth.userId),
                    ])
                    await client.query("SELECT set_config('app.user_role', $1, true)", [
                        String(req.auth.role),
                    ])
        
                    if (employeeAssignments.length > 0) {
                        const employeeUpdateParams = [
                            ...employeeParams,
                            resolvedEmployeeId,
                        ]
                        await client.query(
                            `
                  UPDATE app.employees
                  SET ${employeeAssignments.join(', ')}, updated_at = NOW()
                  WHERE employee_id = $${employeeUpdateParams.length}::text
                  `,
                            employeeUpdateParams
                        )
        
                        if (
                            Object.prototype.hasOwnProperty.call(payload, 'positionId')
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
                    }
        
                    if (payrollAssignments.length > 0) {
                        await client.query(
                            `
                  INSERT INTO app.payroll_profiles (employee_id, salary)
                  VALUES ($1::text, 0)
                  ON CONFLICT (employee_id) DO NOTHING
                  `,
                            [resolvedEmployeeId]
                        )
        
                        const payrollUpdateParams = [
                            ...payrollParams,
                            resolvedEmployeeId,
                        ]
                        await client.query(
                            `
                  UPDATE app.payroll_profiles
                  SET ${payrollAssignments.join(', ')}, updated_at = NOW()
                  WHERE employee_id = $${payrollUpdateParams.length}::text
                  `,
                            payrollUpdateParams
                        )
                    }
        
                    const result = await client.query(
                        `
                SELECT
                  e.employee_id,
                  e.employee_code,
                  e.first_name,
                  e.last_name,
                  e.email,
                  e.department_id,
                  d.name AS department,
                  e.position_id,
                  COALESCE(jp.name, e.position) AS position,
                  e.attendance_status,
                  e.employment_status,
                  e.employment_type,
                  e.phone,
                  e.join_date,
                  e.birthday,
                  e.gender,
                  e.nationality,
                  e.marital_status,
                  e.address,
                  e.profile_picture_url,
                  pp.sss,
                  pp.tin,
                  pp.phil_health,
                  pp.pag_ibig
                FROM app.employees e
                LEFT JOIN app.departments d ON d.department_id = e.department_id
                LEFT JOIN app.job_positions jp ON jp.position_id = e.position_id
                LEFT JOIN app.payroll_profiles pp ON pp.employee_id = e.employee_id
                WHERE e.employee_id = $1::text
                `,
                        [resolvedEmployeeId]
                    )
        
                    await client.query('COMMIT')
                    return res.json({ profile: result.rows[0] ?? null })
                } catch (error) {
                    await client.query('ROLLBACK')
                    throw error
                } finally {
                    client.release()
                }
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        })
        
        app.get('/me/security-preferences', requireAuth, async (req, res) => {
            try {
                await query(
                    `
              INSERT INTO app_auth.user_security_preferences (user_id)
              VALUES ($1::uuid)
              ON CONFLICT (user_id) DO NOTHING
              `,
                    [req.auth.userId]
                )
        
                const preferenceResult = await query(
                    `
              SELECT
                sp.biometric_login,
                sp.biometric_clock_in_out,
                sp.password_waived,
                u.dark_mode_enabled,
                sp.created_at,
                sp.updated_at
              FROM app_auth.user_security_preferences sp
              JOIN app_auth.users u ON u.user_id = sp.user_id
              WHERE sp.user_id = $1::uuid
              `,
                    [req.auth.userId]
                )
        
                const activityResult = await query(
                    `
              SELECT
                activity_id,
                action,
                activity_at,
                platform,
                status,
                is_waived,
                details,
                ip_address,
                user_agent
              FROM app_auth.password_activities
              WHERE user_id = $1::uuid
              ORDER BY activity_at DESC
              LIMIT 20
              `,
                    [req.auth.userId]
                )
        
                const preferenceRow = preferenceResult.rows[0] ?? {
                    biometric_login: false,
                    biometric_clock_in_out: false,
                    password_waived: false,
                    dark_mode_enabled: false,
                    created_at: null,
                    updated_at: null,
                }
        
                return res.json({
                    preferences: mapSecurityPreferenceRow(preferenceRow),
                    passwordActivities: activityResult.rows.map(mapPasswordActivityRow),
                })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        })
        
        app.get(
            '/me/security-preferences/password-activities',
            requireAuth,
            async (req, res) => {
                const requestedLimit = Number(req.query.limit ?? 20)
                const limit = Number.isFinite(requestedLimit)
                    ? Math.max(1, Math.min(100, Math.floor(requestedLimit)))
                    : 20
        
                try {
                    const activityResult = await query(
                        `
              SELECT
                activity_id,
                action,
                activity_at,
                platform,
                status,
                is_waived,
                details,
                ip_address,
                user_agent
              FROM app_auth.password_activities
              WHERE user_id = $1::uuid
              ORDER BY activity_at DESC
              LIMIT $2::int
              `,
                        [req.auth.userId, limit]
                    )
        
                    return res.json({
                        passwordActivities: activityResult.rows.map(
                            mapPasswordActivityRow
                        ),
                    })
                } catch (error) {
                    return res.status(400).json({ error: error.message })
                }
            }
        )
        
        app.post('/me/security-preferences', requireAuth, async (req, res) => {
            const parsed = securityPreferenceCreateSchema.safeParse(req.body ?? {})
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.flatten() })
            }
        
            const payload = parsed.data
            try {
                const result = await query(
                    `
              INSERT INTO app_auth.user_security_preferences (
                user_id,
                biometric_login,
                biometric_clock_in_out,
                password_waived
              )
              VALUES ($1::uuid, $2::boolean, $3::boolean, $4::boolean)
              ON CONFLICT (user_id) DO NOTHING
              RETURNING biometric_login, biometric_clock_in_out, password_waived, created_at, updated_at
              `,
                    [
                        req.auth.userId,
                        payload.biometricLogin,
                        payload.biometricClockInOut,
                        payload.passwordWaived,
                    ]
                )
        
                if (result.rowCount === 0) {
                    return res.status(409).json({
                        error: 'Security preferences already exist for this user',
                    })
                }
        
                if (Object.prototype.hasOwnProperty.call(payload, 'darkModeEnabled')) {
                    await query(
                        `
                UPDATE app_auth.users
                SET dark_mode_enabled = $1::boolean, updated_at = NOW()
                WHERE user_id = $2::uuid
                `,
                        [payload.darkModeEnabled, req.auth.userId]
                    )
                }
        
                const mergedResult = await query(
                    `
              SELECT
                sp.biometric_login,
                sp.biometric_clock_in_out,
                sp.password_waived,
                u.dark_mode_enabled,
                sp.created_at,
                sp.updated_at
              FROM app_auth.user_security_preferences sp
              JOIN app_auth.users u ON u.user_id = sp.user_id
              WHERE sp.user_id = $1::uuid
              `,
                    [req.auth.userId]
                )
        
                return res.status(201).json({
                    preferences: mapSecurityPreferenceRow(mergedResult.rows[0]),
                })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        })
        
        app.put('/me/security-preferences', requireAuth, async (req, res) => {
            const parsed = securityPreferenceUpdateSchema.safeParse(req.body)
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.flatten() })
            }
        
            const payload = parsed.data
        
            try {
                await query(
                    `
              INSERT INTO app_auth.user_security_preferences (
                user_id,
                biometric_login,
                biometric_clock_in_out,
                password_waived
              )
              VALUES (
                $1::uuid,
                COALESCE($2::boolean, FALSE),
                COALESCE($3::boolean, FALSE),
                COALESCE($4::boolean, FALSE)
              )
              ON CONFLICT (user_id) DO UPDATE
              SET
                biometric_login = COALESCE($2::boolean, app_auth.user_security_preferences.biometric_login),
                biometric_clock_in_out = COALESCE($3::boolean, app_auth.user_security_preferences.biometric_clock_in_out),
                password_waived = COALESCE($4::boolean, app_auth.user_security_preferences.password_waived),
                updated_at = NOW()
              RETURNING biometric_login, biometric_clock_in_out, password_waived, created_at, updated_at
              `,
                    [
                        req.auth.userId,
                        Object.prototype.hasOwnProperty.call(payload, 'biometricLogin')
                            ? payload.biometricLogin
                            : null,
                        Object.prototype.hasOwnProperty.call(
                            payload,
                            'biometricClockInOut'
                        )
                            ? payload.biometricClockInOut
                            : null,
                        Object.prototype.hasOwnProperty.call(payload, 'passwordWaived')
                            ? payload.passwordWaived
                            : null,
                    ]
                )
        
                if (Object.prototype.hasOwnProperty.call(payload, 'darkModeEnabled')) {
                    await query(
                        `
                UPDATE app_auth.users
                SET dark_mode_enabled = $1::boolean, updated_at = NOW()
                WHERE user_id = $2::uuid
                `,
                        [payload.darkModeEnabled, req.auth.userId]
                    )
                }
        
                const mergedResult = await query(
                    `
              SELECT
                sp.biometric_login,
                sp.biometric_clock_in_out,
                sp.password_waived,
                u.dark_mode_enabled,
                sp.created_at,
                sp.updated_at
              FROM app_auth.user_security_preferences sp
              JOIN app_auth.users u ON u.user_id = sp.user_id
              WHERE sp.user_id = $1::uuid
              `,
                    [req.auth.userId]
                )
        
                return res.json({
                    preferences: mapSecurityPreferenceRow(mergedResult.rows[0]),
                })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        })
        
        app.delete('/me/security-preferences', requireAuth, async (req, res) => {
            try {
                const result = await query(
                    `
              DELETE FROM app_auth.user_security_preferences
              WHERE user_id = $1::uuid
              RETURNING user_id
              `,
                    [req.auth.userId]
                )
        
                return res.json({
                    deleted: result.rowCount > 0,
                })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        })
        
        app.post('/me/security-preferences/password', requireAuth, async (req, res) => {
            const parsed = updatePasswordSchema.safeParse(req.body)
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.flatten() })
            }
        
            const payload = parsed.data
            const passwordValidationError = getPasswordValidationError(
                payload.newPassword
            )
            if (passwordValidationError) {
                return res.status(400).json({ error: passwordValidationError })
            }
        
            const platform =
                payload.platform ??
                String(req.headers['user-agent'] ?? 'api-client').slice(0, 120)
            const status = payload.status ?? 'Successful'
            const action = payload.waivePassword ? 'Waive Password' : 'Update Password'
            const userAgent = String(req.headers['user-agent'] ?? 'api-client')
            const ipAddress = req.ip ?? null
        
            const client = await pool.connect()
            try {
                await client.query('BEGIN')
        
                await client.query(
                    `
              UPDATE app_auth.users
              SET password_hash = crypt($1::text, gen_salt('bf', 10)), updated_at = NOW()
              WHERE user_id = $2::uuid
              `,
                    [payload.newPassword, req.auth.userId]
                )
        
                await client.query(
                    `
              INSERT INTO app_auth.user_security_preferences (user_id, password_waived)
              VALUES ($1::uuid, $2::boolean)
              ON CONFLICT (user_id) DO UPDATE
              SET password_waived = EXCLUDED.password_waived, updated_at = NOW()
              `,
                    [req.auth.userId, payload.waivePassword]
                )
        
                const activityResult = await client.query(
                    `
              INSERT INTO app_auth.password_activities (
                user_id,
                action,
                activity_at,
                platform,
                status,
                is_waived,
                details,
                ip_address,
                user_agent
              )
              VALUES (
                $1::uuid,
                $2::text,
                NOW(),
                $3::text,
                $4::text,
                $5::boolean,
                $6::jsonb,
                $7::inet,
                $8::text
              )
              RETURNING
                activity_id,
                action,
                activity_at,
                platform,
                status,
                is_waived,
                details,
                ip_address,
                user_agent
              `,
                    [
                        req.auth.userId,
                        action,
                        platform,
                        status,
                        payload.waivePassword,
                        payload.details ? JSON.stringify(payload.details) : null,
                        ipAddress,
                        userAgent,
                    ]
                )
        
                await client.query('COMMIT')
                return res.json({
                    ok: true,
                    activity: mapPasswordActivityRow(activityResult.rows[0]),
                })
            } catch (error) {
                await client.query('ROLLBACK')
                return res.status(400).json({ error: error.message })
            } finally {
                client.release()
            }
        })
        
        app.get('/meta/employment-options', requireAuth, async (_req, res) => {
            try {
                const employmentTypesResult = await query(
                    `
              SELECT unnest(enum_range(NULL::app.employment_type))::text AS value
              `
                )
        
                const departmentsResult = await query(
                    `
              SELECT department_id, name
              FROM app.departments
              WHERE name IN (
                'Software Engineering',
                'Quality Assurance',
                'DevOps & Infrastructure',
                'Data Engineering',
                'IT Support'
              )
              ORDER BY name
              `
                )
        
                const positionsResult = await query(
                    `
              SELECT position_id, department_id, name
              FROM app.job_positions
              ORDER BY name
              `
                )
        
                return res.json({
                    employmentTypes: employmentTypesResult.rows.map(row => row.value),
                    departments: departmentsResult.rows,
                    positions: positionsResult.rows,
                })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        })
        
}
