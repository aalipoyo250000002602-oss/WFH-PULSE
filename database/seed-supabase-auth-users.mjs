import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { Client } from 'pg'

const rootDir = process.cwd()
const defaultPassword = process.argv[2] || 'testpass'
const requiredEmails = [
  'test@mit.co',
  'sarah.johnson@company.com',
  'michael.williams@company.com',
  'alex.ali@uic.co',
]

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}

  const values = {}
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separator = trimmed.indexOf('=')
    if (separator < 0) continue

    const name = trimmed.slice(0, separator).trim()
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['\"]|['\"]$/g, '')

    values[name] = value
  }

  return values
}

function loadEnv() {
  const envFiles = [
    path.resolve(rootDir, '.env.prod'),
    path.resolve(rootDir, 'database', '.env.local.supabase'),
  ]

  for (const filePath of envFiles) {
    const values = parseEnvFile(filePath)
    for (const [key, value] of Object.entries(values)) {
      if (!process.env[key]) process.env[key] = value
    }
  }
}

function getDbConfig() {
  const connectionString =
    process.env.SUPABASE_DB_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL

  if (!connectionString) {
    throw new Error('Missing SUPABASE_DB_URL (or DATABASE_URL/POSTGRES_URL).')
  }

  return {
    connectionString,
    ssl: { rejectUnauthorized: false },
    application_name: 'wfh-pulse-seed-supabase-auth-users',
  }
}

function getSupabaseAuthConfig() {
  const supabaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '')
  const adminKey = (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  ).trim()
  const clientKey = (
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    ''
  ).trim()

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL in environment.')
  }

  if (!adminKey) {
    throw new Error(
      'Missing SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in environment.'
    )
  }

  if (!clientKey) {
    throw new Error(
      'Missing anon/publishable key (VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY).'
    )
  }

  return { supabaseUrl, adminKey, clientKey }
}

function buildAdminHeaders(adminKey, clientKey) {
  // Supabase supports both service-role JWT and sb_secret key styles.
  if (adminKey.startsWith('sb_secret_')) {
    return {
      apikey: adminKey,
      'Content-Type': 'application/json',
    }
  }

  return {
    apikey: clientKey,
    Authorization: `Bearer ${adminKey}`,
    'Content-Type': 'application/json',
  }
}

function buildEmailSet(emails) {
  const set = new Set()
  for (const email of emails) {
    const normalized = String(email || '').trim().toLowerCase()
    if (normalized) set.add(normalized)
  }
  return [...set].sort()
}

async function fetchAllAuthUsers({ supabaseUrl, adminKey, clientKey }) {
  const perPage = 1000
  let page = 1
  const users = []

  for (;;) {
    const response = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
      {
        method: 'GET',
        headers: buildAdminHeaders(adminKey, clientKey),
      }
    )

    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(
        `Failed to list Supabase Auth users (page ${page}): ${response.status} ${JSON.stringify(body)}`
      )
    }

    const pageUsers = Array.isArray(body?.users) ? body.users : []
    users.push(...pageUsers)

    if (pageUsers.length < perPage) break
    page += 1
  }

  return users
}

async function upsertAuthUser({
  supabaseUrl,
  adminKey,
  clientKey,
  email,
  password,
  existingUserId,
}) {
  const headers = buildAdminHeaders(adminKey, clientKey)

  if (existingUserId) {
    const response = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${existingUserId}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
        }),
      }
    )

    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(
        `Failed to update auth user ${email}: ${response.status} ${JSON.stringify(body)}`
      )
    }

    return { action: 'updated', user: body }
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
    }),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      `Failed to create auth user ${email}: ${response.status} ${JSON.stringify(body)}`
    )
  }

  return { action: 'created', user: body }
}

async function verifyPasswordSignIn({ supabaseUrl, clientKey, email, password }) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: clientKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  const body = await response.json().catch(() => ({}))
  return {
    ok: response.ok && typeof body?.access_token === 'string',
    status: response.status,
    body,
  }
}

async function runLinkSql(client) {
  const filePath = path.resolve(rootDir, 'database', '09_seed_local_users_to_supabase.sql')
  const sql = fs.readFileSync(filePath, 'utf8')
  await client.query(sql)
}

async function main() {
  loadEnv()

  const authConfig = getSupabaseAuthConfig()
  let client = null
  let localEmails = []
  let mode = 'auth_only'

  try {
    try {
      const dbConfig = getDbConfig()
      const dbClient = new Client(dbConfig)
      await dbClient.connect()
      client = dbClient

      const localUsersResult = await client.query(
        `SELECT email::text AS email
         FROM app_auth.users
         WHERE is_active = TRUE
           AND email IS NOT NULL
         ORDER BY lower(email::text)`
      )

      localEmails = localUsersResult.rows.map(row => row.email)
      mode = 'db_and_auth'
    } catch (error) {
      console.warn(
        `Warning: could not read app_auth.users from database. Continuing in auth-only mode. ${error.message}`
      )
    }

    const authUsers = await fetchAllAuthUsers(authConfig)
    const authUserIdByEmail = new Map()
    const authEmails = []

    for (const user of authUsers) {
      const email = String(user?.email || '').trim().toLowerCase()
      if (!email) continue
      authUserIdByEmail.set(email, String(user.id))
      authEmails.push(email)
    }

    const targetEmails =
      mode === 'db_and_auth'
        ? buildEmailSet([...localEmails, ...requiredEmails])
        : buildEmailSet([...authEmails, ...requiredEmails])

    let created = 0
    let updated = 0
    const failures = []

    for (const email of targetEmails) {
      const existingUserId = authUserIdByEmail.get(email) || null

      try {
        const result = await upsertAuthUser({
          ...authConfig,
          email,
          password: defaultPassword,
          existingUserId,
        })

        if (result.action === 'created') created += 1
        else updated += 1
      } catch (error) {
        failures.push({ email, error: String(error.message || error) })
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `Failed to seed ${failures.length} auth users: ${JSON.stringify(failures.slice(0, 10))}`
      )
    }

    if (mode === 'db_and_auth' && client) {
      await runLinkSql(client)
    }

    const verification = []
    for (const email of requiredEmails) {
      const signIn = await verifyPasswordSignIn({
        ...authConfig,
        email,
        password: defaultPassword,
      })

      verification.push({
        email,
        ok: signIn.ok,
        status: signIn.status,
        reason: signIn.ok
          ? 'ok'
          : String(
              signIn.body?.error_description ||
                signIn.body?.msg ||
                signIn.body?.error ||
                'failed'
            ),
      })
    }

    const summary = {
      mode,
      targetUsers: targetEmails.length,
      created,
      updated,
      defaultPasswordApplied: defaultPassword,
      verification,
    }

    console.log(JSON.stringify(summary, null, 2))
  } finally {
    if (client) await client.end()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
