import { Pool } from "pg";
import { getPostgresConfig } from "../database/db.config.mjs";

export const pool = new Pool(getPostgresConfig());

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function withRlsContext(context, handler) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.user_id = $1", [context.userId]);
    await client.query("SET LOCAL app.user_role = $1", [context.role]);

    const result = await handler(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

