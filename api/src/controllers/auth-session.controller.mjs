export function registerAuthSessionRoutes(app, deps) {
    const {
        query,
        signAccessToken,
        randomBytes,
        requireAuth,
        loginSchema,
        refreshSchema,
        supabaseTokenExchangeSchema,
        biometricLoginSchema,
        getUserProfileByUserId,
        ensureEmployeeLinkForUser,
        fetchSupabaseUserFromAccessToken,
        normalizeRoleName,
    } = deps

    app.post('/auth/login', async (req, res) => {
        const parsed = loginSchema.safeParse(req.body)
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.flatten() })
        }

        const { email, password } = parsed.data

        try {
            const result = await query(
                `SELECT * FROM app_auth.login_user($1::citext, $2::text, $3::inet, $4::text)`,
                [
                    email,
                    password,
                    null,
                    req.headers['user-agent'] ?? 'api-client',
                ]
            )

            if (result.rowCount === 0) {
                return res.status(401).json({ error: 'Invalid credentials' })
            }

            const row = result.rows[0]
            const profile = await getUserProfileByUserId(row.user_id)

            const accessToken = signAccessToken({
                userId: row.user_id,
                role: row.role_name,
                sessionId: row.session_id,
                employeeId: profile?.employee_id ?? null,
            })

            return res.json({
                accessToken,
                refreshToken: row.refresh_token,
                sessionId: row.session_id,
                role: row.role_name,
                user: {
                    userId: row.user_id,
                    employeeId: profile?.employee_id ?? null,
                    email: profile?.email ?? email,
                    fullName: profile?.first_name
                        ? `${profile.first_name} ${profile.last_name}`
                        : null,
                },
            })
        } catch (error) {
            return res.status(401).json({ error: error.message })
        }
    })

    app.post('/auth/supabase/exchange', async (req, res) => {
        const parsed = supabaseTokenExchangeSchema.safeParse(req.body)
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.flatten() })
        }

        try {
            const supabaseUser = await fetchSupabaseUserFromAccessToken(
                parsed.data.accessToken
            )

            if (!supabaseUser) {
                return res.status(401).json({ error: 'Invalid Supabase token' })
            }

            const roleFromMetadata = normalizeRoleName(
                supabaseUser?.app_metadata?.role
            )
            const employeeIdHint =
                typeof supabaseUser?.user_metadata?.employee_id === 'string'
                    ? supabaseUser.user_metadata.employee_id
                    : null

            const linkResult = await query(
                `SELECT * FROM app_auth.link_supabase_user($1::uuid, $2::citext, $3::text, $4::text)`,
                [
                    supabaseUser.id,
                    supabaseUser.email,
                    employeeIdHint,
                    roleFromMetadata,
                ]
            )

            if (linkResult.rowCount === 0) {
                return res
                    .status(401)
                    .json({ error: 'Unable to map Supabase user' })
            }

            const linkedUser = linkResult.rows[0]
            const refreshToken = randomBytes(48).toString('base64url')

            const sessionResult = await query(
                `
      INSERT INTO app_auth.sessions (
        user_id,
        refresh_token_hash,
        ip_address,
        user_agent,
        expires_at
      )
      VALUES (
        $1::uuid,
        crypt($2::text, gen_salt('bf', 8)),
        $3::inet,
        $4::text,
        NOW() + INTERVAL '30 days'
      )
      RETURNING session_id
      `,
                [
                    linkedUser.user_id,
                    refreshToken,
                    null,
                    req.headers['user-agent'] ?? 'supabase-client',
                ]
            )

            await query(
                `
      UPDATE app_auth.users
      SET last_login_at = NOW(), updated_at = NOW()
      WHERE user_id = $1::uuid
      `,
                [linkedUser.user_id]
            )

            const resolvedEmployeeId = await ensureEmployeeLinkForUser(
                linkedUser.user_id
            )
            const profile = await getUserProfileByUserId(linkedUser.user_id)

            const customAccessToken = signAccessToken({
                userId: linkedUser.user_id,
                role: linkedUser.role_name,
                sessionId: sessionResult.rows[0].session_id,
                employeeId:
                    resolvedEmployeeId ??
                    profile?.employee_id ??
                    linkedUser.employee_id ??
                    null,
            })

            return res.json({
                accessToken: customAccessToken,
                refreshToken,
                sessionId: sessionResult.rows[0].session_id,
                role: linkedUser.role_name,
                user: {
                    userId: linkedUser.user_id,
                    employeeId:
                        resolvedEmployeeId ??
                        profile?.employee_id ??
                        linkedUser.employee_id ??
                        null,
                    email:
                        profile?.email ??
                        linkedUser.email ??
                        supabaseUser.email,
                    fullName: profile?.first_name
                        ? `${profile.first_name} ${profile.last_name}`
                        : null,
                },
            })
        } catch (error) {
            return res.status(401).json({ error: error.message })
        }
    })

    app.post('/auth/biometric-login', async (req, res) => {
        const parsed = biometricLoginSchema.safeParse(req.body)
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.flatten() })
        }

        const { email } = parsed.data

        try {
            const userResult = email
                ? await query(
                      `
          SELECT
            u.user_id,
            u.email,
            u.employee_id,
            u.is_active,
            COALESCE(sp.biometric_login, u.biometric_enabled, FALSE) AS biometric_login,
            r.role_name
          FROM app_auth.users u
          LEFT JOIN app_auth.user_security_preferences sp ON sp.user_id = u.user_id
          LEFT JOIN app_auth.user_roles ur ON ur.user_id = u.user_id
          LEFT JOIN app_auth.roles r ON r.role_id = ur.role_id
          WHERE u.email = $1::citext
          ORDER BY r.role_name DESC NULLS LAST
          LIMIT 1
          `,
                      [email]
                  )
                : await query(
                      `
          SELECT
            u.user_id,
            u.email,
            u.employee_id,
            u.is_active,
            COALESCE(sp.biometric_login, u.biometric_enabled, FALSE) AS biometric_login,
            r.role_name
          FROM app_auth.users u
          LEFT JOIN app_auth.user_security_preferences sp ON sp.user_id = u.user_id
          LEFT JOIN app_auth.user_roles ur ON ur.user_id = u.user_id
          LEFT JOIN app_auth.roles r ON r.role_id = ur.role_id
          WHERE u.is_active = TRUE
            AND COALESCE(sp.biometric_login, u.biometric_enabled, FALSE) = TRUE
          ORDER BY u.last_login_at DESC NULLS LAST, u.created_at DESC
          LIMIT 1
          `
                  )

            const userRow = userResult.rows[0] ?? null
            if (!userRow || !userRow.is_active) {
                return res
                    .status(401)
                    .json({ error: 'User does not exist or is inactive' })
            }

            if (!userRow.biometric_login) {
                return res
                    .status(403)
                    .json({
                        error: 'Biometric login is disabled for this user',
                    })
            }

            const roleName = userRow.role_name ?? 'employee'
            const refreshToken = randomBytes(48).toString('base64url')

            const sessionResult = await query(
                `
      INSERT INTO app_auth.sessions (
        user_id,
        refresh_token_hash,
        ip_address,
        user_agent,
        expires_at
      )
      VALUES (
        $1::uuid,
        crypt($2::text, gen_salt('bf', 8)),
        $3::inet,
        $4::text,
        NOW() + INTERVAL '30 days'
      )
      RETURNING session_id
      `,
                [
                    userRow.user_id,
                    refreshToken,
                    null,
                    req.headers['user-agent'] ?? 'biometric-client',
                ]
            )

            await query(
                `
      UPDATE app_auth.users
      SET last_login_at = NOW(), updated_at = NOW()
      WHERE user_id = $1::uuid
      `,
                [userRow.user_id]
            )

            const profile = await getUserProfileByUserId(userRow.user_id)
            const accessToken = signAccessToken({
                userId: userRow.user_id,
                role: roleName,
                sessionId: sessionResult.rows[0].session_id,
                employeeId: profile?.employee_id ?? userRow.employee_id ?? null,
            })

            return res.json({
                accessToken,
                refreshToken,
                sessionId: sessionResult.rows[0].session_id,
                role: roleName,
                user: {
                    userId: userRow.user_id,
                    employeeId:
                        profile?.employee_id ?? userRow.employee_id ?? null,
                    email: profile?.email ?? userRow.email,
                    fullName: profile?.first_name
                        ? `${profile.first_name} ${profile.last_name}`
                        : null,
                },
            })
        } catch (error) {
            return res.status(401).json({ error: error.message })
        }
    })

    app.get('/auth/biometric-login/available', async (_req, res) => {
        try {
            const result = await query(
                `
      SELECT EXISTS (
        SELECT 1
        FROM app_auth.users u
        LEFT JOIN app_auth.user_security_preferences sp ON sp.user_id = u.user_id
        WHERE u.is_active = TRUE
          AND COALESCE(sp.biometric_login, u.biometric_enabled, FALSE) = TRUE
      ) AS available
      `
            )

            return res.json({
                available: Boolean(result.rows[0]?.available),
            })
        } catch (error) {
            return res.status(400).json({ error: error.message })
        }
    })

    app.post('/auth/refresh', async (req, res) => {
        const parsed = refreshSchema.safeParse(req.body)
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.flatten() })
        }

        const { sessionId, refreshToken } = parsed.data

        try {
            const result = await query(
                `SELECT * FROM app_auth.refresh_session($1::uuid, $2::text, $3::inet, $4::text)`,
                [
                    sessionId,
                    refreshToken,
                    null,
                    req.headers['user-agent'] ?? 'api-client',
                ]
            )

            if (result.rowCount === 0) {
                return res
                    .status(401)
                    .json({ error: 'Invalid refresh session' })
            }

            const row = result.rows[0]
            const profile = await getUserProfileByUserId(row.user_id)

            const accessToken = signAccessToken({
                userId: row.user_id,
                role: row.role_name,
                sessionId: row.session_id,
                employeeId: row.employee_id ?? profile?.employee_id ?? null,
            })

            return res.json({
                accessToken,
                refreshToken: row.refresh_token,
                sessionId: row.session_id,
                role: row.role_name,
                user: {
                    userId: row.user_id,
                    employeeId: row.employee_id ?? profile?.employee_id ?? null,
                    email: profile?.email ?? null,
                    fullName: profile?.first_name
                        ? `${profile.first_name} ${profile.last_name}`
                        : null,
                },
            })
        } catch (error) {
            return res.status(401).json({ error: error.message })
        }
    })

    app.post('/auth/logout', requireAuth, async (req, res) => {
        try {
            await query('SELECT app_auth.revoke_session($1::uuid)', [
                req.auth.sessionId,
            ])
            return res.json({ ok: true })
        } catch (error) {
            return res.status(400).json({ error: error.message })
        }
    })
}
