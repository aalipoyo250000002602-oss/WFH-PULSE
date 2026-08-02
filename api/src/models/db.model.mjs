import { Pool } from 'pg'
import { getPostgresConfig } from '../../../database/db.config.mjs'

export const pool = new Pool(getPostgresConfig())

export async function query(text, params = []) {
    return pool.query(text, params)
}

export async function withRlsContext(context, handler) {
    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        await client.query("SELECT set_config('app.user_id', $1, true)", [
            String(context.userId),
        ])
        await client.query("SELECT set_config('app.user_role', $1, true)", [
            String(context.role),
        ])

        const result = await handler(client)
        await client.query('COMMIT')
        return result
    } catch (error) {
        await client.query('ROLLBACK')
        throw error
    } finally {
        client.release()
    }
}
