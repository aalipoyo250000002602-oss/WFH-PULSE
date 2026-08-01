import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const envPath = path.resolve(process.cwd(), '.env')

function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return

    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)

    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue

        const idx = trimmed.indexOf('=')
        if (idx < 0) continue

        const key = trimmed.slice(0, idx).trim()
        const value = trimmed
            .slice(idx + 1)
            .trim()
            .replace(/^['\"]|['\"]$/g, '')

        if (!process.env[key]) {
            process.env[key] = value
        }
    }
}

loadEnvFile(envPath)

export function getSupabaseApiConfig() {
    return {
        url: process.env.SUPABASE_URL ?? '',
        publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? '',
        secretKey: process.env.SUPABASE_SECRET_KEY ?? '',
        jwksUrl: process.env.SUPABASE_JWKS_URL ?? '',
    }
}

export function getDatabaseConfig() {
    return {
        host: process.env.host ?? '',
        port: Number(process.env.port ?? '5432'),
        database: process.env.database ?? '',
        user: process.env.user ?? '',
    }
}

export const appConfig = {
    envPath,
    supabase: getSupabaseApiConfig(),
    database: getDatabaseConfig(),
}
