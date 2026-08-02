import { z } from 'zod'

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    employeeId: z.string().min(1),
    role: z.enum(['employee', 'hr_manager', 'admin']).default('employee'),
})

export function registerAuthAdminRoutes(app, deps) {
    const { query, requireAuth, requireRole } = deps

    app.post(
        '/auth/register',
        requireAuth,
        requireRole('admin', 'hr_manager'),
        async (req, res) => {
            const parsed = registerSchema.safeParse(req.body)
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.flatten() })
            }

            const { email, password, employeeId, role } = parsed.data

            try {
                const result = await query(
                    `SELECT app_auth.register_user($1::citext, $2::text, $3::text, $4::text) AS user_id`,
                    [email, password, employeeId, role]
                )
                return res.status(201).json({ userId: result.rows[0].user_id })
            } catch (error) {
                return res.status(400).json({ error: error.message })
            }
        }
    )
}
