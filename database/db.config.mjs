import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const postgresEnvPath = path.resolve(
    process.cwd(),
    'database',
    '.env.local.postgres'
)
const supabaseEnvPath = path.resolve(
    process.cwd(),
    'database',
    '.env.local.supabase'
)

const dbTarget = (
    process.env.WFH_PULSE_DB_TARGET ??
    process.env.DB_TARGET ??
    'postgres'
)
    .trim()
    .toLowerCase()

const envFilePathsByTarget = {
    postgres: [postgresEnvPath],
    supabase: [supabaseEnvPath, postgresEnvPath],
    auto: [supabaseEnvPath, postgresEnvPath],
}

const envFilePaths =
    envFilePathsByTarget[dbTarget] ?? envFilePathsByTarget.postgres

function parseBoolean(value, defaultValue = false) {
    if (value == null || value === '') return defaultValue
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function loadLocalEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return
    }

    const content = fs.readFileSync(filePath, 'utf8')
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue

        const eqIndex = trimmed.indexOf('=')
        if (eqIndex === -1) continue

        const key = trimmed.slice(0, eqIndex).trim()
        const rawValue = trimmed.slice(eqIndex + 1).trim()
        const value = rawValue.replace(/^['\"]|['\"]$/g, '')

        if (!process.env[key]) {
            process.env[key] = value
        }
    }
}

for (const filePath of envFilePaths) {
    loadLocalEnvFile(filePath)
}

export function getPostgresConfig() {
    const connectionString =
        process.env.SUPABASE_DB_URL ??
        process.env.DATABASE_URL ??
        process.env.POSTGRES_URL ??
        null

    const useSSL = parseBoolean(process.env.PGSSL, Boolean(connectionString))

    if (connectionString) {
        return {
            connectionString,
            ssl: useSSL ? { rejectUnauthorized: false } : false,
            application_name: 'wfh-pulse-db-config',
        }
    }

    const host = process.env.PGHOST ?? '127.0.0.1'
    const port = Number(process.env.PGPORT ?? '5432')
    const database = process.env.PGDATABASE ?? 'wfh_pulse'
    const user = process.env.PGUSER ?? 'postgres'
    const password = process.env.PGPASSWORD ?? 'postgres'

    return {
        host,
        port,
        database,
        user,
        password,
        ssl: useSSL ? { rejectUnauthorized: false } : false,
        application_name: 'wfh-pulse-db-config',
    }
}

export function getSafeConfigPreview() {
    const config = getPostgresConfig()

    if (config.connectionString) {
        let host = '<invalid-url>'
        let database = '<unknown>'
        let port = 5432

        try {
            const parsed = new URL(config.connectionString)
            host = parsed.hostname
            database = parsed.pathname.replace(/^\//, '') || 'postgres'
            port = Number(parsed.port || '5432')
        } catch {
            // Keep fallback redacted preview values if URL parsing fails.
        }

        return {
            mode: 'connectionString',
            dbTarget,
            host,
            port,
            database,
            user: '<redacted>',
            ssl: Boolean(config.ssl),
            envFilePaths,
        }
    }

    return {
        mode: 'hostPort',
        dbTarget,
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        ssl: Boolean(config.ssl),
        envFilePaths,
    }
}
