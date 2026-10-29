export function registerPushDeviceRoutes(app, { requireAuth, query }) {
    for (const method of ['put', 'delete']) {
        app[method]('/me/push-devices', requireAuth, async (req, res) => {
            try {
                const result = await query('SELECT wfh_private.push_device_request($1::uuid,$2::text,$3::jsonb) AS result',
                    [req.auth.userId, method.toUpperCase(), JSON.stringify(req.body ?? {})])
                const payload = result.rows[0].result
                res.status(payload.status).json(payload.body)
            } catch {
                res.status(500).json({ error: 'Unable to update device notification registration.' })
            }
        })
    }
}
