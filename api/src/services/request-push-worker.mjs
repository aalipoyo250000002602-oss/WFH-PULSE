// Each delivery is tied to a recipient AND the device's account-binding version.
// Delivery retries are at-least-once; providers receive the stable notification ID.
export async function runPushBatch(pool, send) {
    const client = await pool.connect()
    let jobs
    try {
        await client.query('BEGIN')
        jobs = (await client.query(`
            WITH claim AS (
                SELECT q.notification_id,q.device_id
                FROM app.push_deliveries q
                JOIN app.request_notifications n USING(notification_id)
                JOIN app.push_devices d USING(device_id)
                JOIN app_auth.users u ON u.user_id=n.recipient_user_id
                WHERE q.delivered_at IS NULL AND q.failed_at IS NULL AND q.attempts<8
                  AND q.next_attempt_at<=now() AND (q.leased_until IS NULL OR q.leased_until<now())
                  AND d.user_id=n.recipient_user_id AND d.binding_id=q.binding_id AND u.is_active
                  AND d.platform=ANY($1::text[])
                  AND (n.event_kind='status_changed' OR EXISTS(
                    SELECT 1 FROM app_auth.user_roles ur JOIN app_auth.roles r ON r.role_id=ur.role_id
                    WHERE ur.user_id=u.user_id AND r.role_name='admin'))
                ORDER BY n.created_at FOR UPDATE OF q SKIP LOCKED LIMIT 5
            ), leased AS (
                UPDATE app.push_deliveries q SET leased_until=now()+interval '2 minutes',attempts=q.attempts+1
                FROM claim c WHERE q.notification_id=c.notification_id AND q.device_id=c.device_id RETURNING q.*
            )
            SELECT n.*,q.device_id,q.binding_id,q.attempts,d.platform,d.token,d.apns_environment
            FROM leased q JOIN app.request_notifications n USING(notification_id)
            JOIN app.push_devices d USING(device_id)
        `, [send.configuredPlatforms])).rows
        await client.query('COMMIT')
    } catch (error) {
        await client.query('ROLLBACK')
        throw error
    } finally { client.release() }

    for (const job of jobs) {
        const current = await pool.query(`SELECT 1 FROM app.push_devices d JOIN app_auth.users u ON u.user_id=d.user_id
            WHERE d.device_id=$1 AND d.binding_id=$2 AND d.user_id=$3 AND u.is_active
            AND ($4='status_changed' OR EXISTS(SELECT 1 FROM app_auth.user_roles ur
              JOIN app_auth.roles r ON r.role_id=ur.role_id WHERE ur.user_id=u.user_id AND r.role_name='admin'))`,
        [job.device_id, job.binding_id, job.recipient_user_id, job.event_kind])
        if (!current.rowCount) {
            await pool.query(`UPDATE app.push_deliveries SET failed_at=now(),last_error='Device account changed.'
                WHERE notification_id=$1 AND device_id=$2`, [job.notification_id, job.device_id])
            continue
        }
        try {
            await send(job)
            await pool.query(`UPDATE app.push_deliveries SET delivered_at=now(),leased_until=NULL,last_error=NULL
                WHERE notification_id=$1 AND device_id=$2`, [job.notification_id, job.device_id])
        } catch (error) {
            await pool.query(`UPDATE app.push_deliveries SET leased_until=NULL,last_error=$3,
                failed_at=CASE WHEN $4 OR attempts>=8 THEN now() END,
                next_attempt_at=now()+($5::integer*interval '1 second')
                WHERE notification_id=$1 AND device_id=$2`,
            [job.notification_id, job.device_id, String(error.message).slice(0, 200), Boolean(error.permanent), Math.min(3600, 15 * 2 ** job.attempts)])
            if (error.invalidToken) {
                await pool.query('DELETE FROM app.push_devices WHERE device_id=$1 AND binding_id=$2 AND token=$3',
                    [job.device_id, job.binding_id, job.token])
            }
        }
    }
    return jobs.length
}

export function startPushWorker(pool, send) {
    let stopped = false
    let timer
    let running = Promise.resolve()
    const tick = () => {
        running = runPushBatch(pool, send).catch(error => {
            console.error('Request push worker failed:', error.code ?? error.name)
        }).finally(() => {
            if (!stopped) timer = setTimeout(tick, 2000)
        })
    }
    tick()
    return async () => { stopped = true; clearTimeout(timer); await running }
}
