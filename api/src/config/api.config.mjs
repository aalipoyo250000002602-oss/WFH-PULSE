import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
    getDatabaseConfig,
    getSupabaseApiConfig,
} from '../../../config/env-config.mjs'

const envPath = path.resolve(process.cwd(), 'api', '.env.local')

function loadApiEnv() {
    if (!fs.existsSync(envPath)) return

    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
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

loadApiEnv()

export function getApiConfig() {
    return {
        port: Number(process.env.API_PORT ?? '8787'),
        jwtSecret: process.env.API_JWT_SECRET ?? 'dev-only-change-me',
        envPath,
        supabase: getSupabaseApiConfig(),
        database: getDatabaseConfig(),
    }
}
