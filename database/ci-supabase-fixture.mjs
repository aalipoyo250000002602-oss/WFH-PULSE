// Test-only stand-ins for Supabase Auth on the disposable PostgreSQL CI service.
import fs from 'node:fs/promises'

export async function prepareCiSupabaseFixture(client, config) {
    if (process.env.CI !== 'true' || config.dbTarget !== 'postgres' ||
        !['127.0.0.1', 'localhost', '::1'].includes(config.host)) {
        throw new Error('Supabase CI fixtures require CI=true and a local PostgreSQL target.')
    }

    await client.query(`
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
                CREATE ROLE anon NOLOGIN;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
                CREATE ROLE authenticated NOLOGIN;
            END IF;
        END $$;
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE TABLE IF NOT EXISTS auth.users (
            id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz
        );
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
            SELECT (NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
        $$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
    `)

    // 0027 and 0028 extend this REST layer, which is deployed separately on Supabase.
    const sql = await fs.readFile(new URL('./07_supabase_rest_api.sql', import.meta.url), 'utf8')
    await client.query(sql)
    console.log('Prepared local Supabase Auth fixture and REST API prerequisites.')
}
