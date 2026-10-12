import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'

const rootDir = process.cwd()
const localEnvPath = path.resolve(rootDir, 'database', '.env.local.postgres')
const supabaseEnvPath = path.resolve(rootDir, 'database', '.env.local.supabase')
const managedSchemas = ['app', 'app_auth']
const batchSize = 100

function parseEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Missing environment file: ${filePath}`)
    }

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
            .replace(/^['"]|['"]$/g, '')
        values[name] = value
    }

    return values
}

function parseBoolean(value, fallback = false) {
    if (!value) return fallback
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function getClientConfig(envPath) {
    const env = parseEnvFile(envPath)
    const connectionString =
        env.SUPABASE_DB_URL ?? env.DATABASE_URL ?? env.POSTGRES_URL

    if (connectionString) {
        return {
            connectionString,
            ssl: parseBoolean(env.PGSSL, true)
                ? { rejectUnauthorized: false }
                : false,
            application_name: 'wfh-pulse-local-data-sync',
        }
    }

    return {
        host: env.PGHOST ?? '127.0.0.1',
        port: Number(env.PGPORT ?? '5432'),
        database: env.PGDATABASE ?? 'wfh_pulse',
        user: env.PGUSER ?? 'postgres',
        password: env.PGPASSWORD ?? 'postgres',
        ssl: parseBoolean(env.PGSSL),
        application_name: 'wfh-pulse-local-data-sync',
    }
}

function quoteIdentifier(identifier) {
    return `"${identifier.replaceAll('"', '""')}"`
}

function quoteTable(table) {
    return `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`
}

function tableKey(table) {
    return `${table.schema}.${table.name}`
}

async function getTables(client) {
    const result = await client.query(
        `SELECT table_schema, table_name
         FROM information_schema.tables
         WHERE table_type = 'BASE TABLE'
           AND table_schema = ANY($1::text[])
         ORDER BY table_schema, table_name`,
        [managedSchemas]
    )

    return result.rows.map(row => ({
        schema: row.table_schema,
        name: row.table_name,
    }))
}

async function getColumns(client, table) {
    const result = await client.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = $1
           AND table_name = $2
           AND is_generated = 'NEVER'
         ORDER BY ordinal_position`,
        [table.schema, table.name]
    )

    return result.rows.map(row => row.column_name)
}

async function getCounts(client, tables) {
    const counts = new Map()
    for (const table of tables) {
        const result = await client.query(
            `SELECT COUNT(*)::bigint AS count FROM ${quoteTable(table)}`
        )
        counts.set(tableKey(table), Number(result.rows[0].count))
    }
    return counts
}

async function getInsertOrder(client, tables) {
    const tableKeys = new Set(tables.map(tableKey))
    const dependencies = new Map(
        tables.map(table => [tableKey(table), new Set()])
    )
    const result = await client.query(
        `SELECT child_ns.nspname AS child_schema,
                child.relname AS child_table,
                parent_ns.nspname AS parent_schema,
                parent.relname AS parent_table
         FROM pg_constraint fk_constraint
         JOIN pg_class child ON child.oid = fk_constraint.conrelid
         JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
         JOIN pg_class parent ON parent.oid = fk_constraint.confrelid
         JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
         WHERE fk_constraint.contype = 'f'
           AND child_ns.nspname = ANY($1::text[])
           AND parent_ns.nspname = ANY($1::text[])`,
        [managedSchemas]
    )

    for (const row of result.rows) {
        const childKey = `${row.child_schema}.${row.child_table}`
        const parentKey = `${row.parent_schema}.${row.parent_table}`
        if (tableKeys.has(childKey) && tableKeys.has(parentKey)) {
            dependencies.get(childKey).add(parentKey)
        }
    }

    const orderedKeys = []
    const unresolved = new Set(tableKeys)
    while (unresolved.size > 0) {
        const ready = [...unresolved]
            .filter(key =>
                [...dependencies.get(key)].every(
                    parent => !unresolved.has(parent)
                )
            )
            .sort()

        if (ready.length === 0) {
            throw new Error(
                `Cannot derive a foreign-key insert order for: ${[...unresolved].join(', ')}`
            )
        }

        for (const key of ready) {
            unresolved.delete(key)
            orderedKeys.push(key)
        }
    }

    const tablesByKey = new Map(tables.map(table => [tableKey(table), table]))
    return orderedKeys.map(key => tablesByKey.get(key))
}

async function validateCompatibility(
    source,
    target,
    sourceTables,
    targetTables
) {
    const targetKeys = new Set(targetTables.map(tableKey))
    const missingTables = sourceTables
        .filter(table => !targetKeys.has(tableKey(table)))
        .map(tableKey)

    if (missingTables.length > 0) {
        throw new Error(
            `Supabase is missing local application tables: ${missingTables.join(', ')}`
        )
    }

    for (const table of sourceTables) {
        const [sourceColumns, targetColumns] = await Promise.all([
            getColumns(source, table),
            getColumns(target, table),
        ])

        if (
            [...sourceColumns].sort().join('\n') !==
            [...targetColumns].sort().join('\n')
        ) {
            throw new Error(
                `Column mismatch for ${tableKey(table)}. Local: ${sourceColumns.join(', ')}. Supabase: ${targetColumns.join(', ')}`
            )
        }
    }
}

function createInsertStatement(table, columns, rows) {
    const values = []
    const placeholders = rows.map((row, rowIndex) => {
        const rowPlaceholders = columns.map((column, columnIndex) => {
            values.push(row[column])
            return `$${rowIndex * columns.length + columnIndex + 1}`
        })
        return `(${rowPlaceholders.join(', ')})`
    })

    return {
        text: `INSERT INTO ${quoteTable(table)} (${columns
            .map(quoteIdentifier)
            .join(
                ', '
            )}) OVERRIDING SYSTEM VALUE VALUES ${placeholders.join(', ')}`,
        values,
    }
}

async function copyTable(source, target, table) {
    const columns = await getColumns(source, table)
    const sourceResult = await source.query(
        `SELECT ${columns.map(quoteIdentifier).join(', ')} FROM ${quoteTable(table)}`
    )

    for (let index = 0; index < sourceResult.rows.length; index += batchSize) {
        const batch = sourceResult.rows.slice(index, index + batchSize)
        await target.query(createInsertStatement(table, columns, batch))
    }

    return sourceResult.rows.length
}

async function resetSequences(target, tables) {
    for (const table of tables) {
        const columns = await getColumns(target, table)
        for (const column of columns) {
            const sequenceResult = await target.query(
                'SELECT pg_get_serial_sequence($1, $2) AS sequence_name',
                [`${table.schema}.${table.name}`, column]
            )
            const sequenceName = sequenceResult.rows[0].sequence_name
            if (!sequenceName) continue

            await target.query(
                `SELECT setval($1::regclass,
                    COALESCE((SELECT MAX(${quoteIdentifier(column)}) FROM ${quoteTable(table)}), 1),
                    EXISTS (SELECT 1 FROM ${quoteTable(table)}))`,
                [sequenceName]
            )
        }
    }
}

async function setUserTriggers(target, tables, enabled) {
    const action = enabled ? 'ENABLE' : 'DISABLE'
    for (const table of tables) {
        await target.query(
            `ALTER TABLE ${quoteTable(table)} ${action} TRIGGER USER`
        )
    }
}

function printCounts(label, tables, counts) {
    console.log(`\n${label}`)
    for (const table of tables) {
        console.log(`${tableKey(table)}: ${counts.get(tableKey(table)) ?? 0}`)
    }
}

function runPgDump(config, args) {
    const executable = process.env.PG_DUMP_PATH ?? path.join(
        process.env.ProgramFiles ?? 'C:\\Program Files', 'PostgreSQL', '18', 'bin', 'pg_dump.exe'
    )
    const connection = config.connectionString ? new URL(config.connectionString) : null
    const result = spawnSync(executable, [
        '--no-password', '--no-owner', '--no-privileges',
        '--host', connection?.hostname ?? config.host,
        '--port', String(connection?.port || config.port || 5432),
        '--username', connection ? decodeURIComponent(connection.username) : config.user,
        '--dbname', connection ? connection.pathname.slice(1) : config.database,
        ...args,
    ], {
        env: {
            ...process.env,
            PGPASSWORD: connection ? decodeURIComponent(connection.password) : config.password,
            PGSSLMODE: config.ssl ? 'require' : 'disable',
        },
        encoding: 'utf8',
    })
    if (result.error || result.status !== 0) {
        throw new Error('PostgreSQL export failed. Check pg_dump availability and local database access.')
    }
}

async function exportLocalSql(directory) {
    const resolvedDirectory = path.resolve(directory)
    const relativeDirectory = path.relative(rootDir, resolvedDirectory)
    if (!relativeDirectory.startsWith('..') && !path.isAbsolute(relativeDirectory)) {
        throw new Error('Export application data outside the repository to keep it out of web assets and source control.')
    }
    const config = getClientConfig(localEnvPath)
    const source = new Client(config)
    try {
        await source.connect()
        await source.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        const tables = await getTables(source)
        const counts = await getCounts(source, tables)
        const manifest = []
        for (const table of tables) {
            manifest.push({ ...table, columns: await getColumns(source, table), count: counts.get(tableKey(table)) })
        }
        const snapshot = await source.query('SELECT pg_export_snapshot() AS snapshot')
        fs.mkdirSync(resolvedDirectory, { recursive: true, mode: 0o700 })
        const dumpPath = path.join(resolvedDirectory, 'data.sql')
        runPgDump(config, [
            '--data-only', '--inserts', '--column-inserts', '--rows-per-insert=100',
            ...managedSchemas.map(schema => `--schema=${schema}`),
            `--snapshot=${snapshot.rows[0].snapshot}`, `--file=${dumpPath}`,
        ])
        const sql = fs.readFileSync(dumpPath, 'utf8').split(/\r?\n/)
            .filter(line => !/^\\(?:un)?restrict\s+[A-Za-z0-9]+\s*$/.test(line)).join('\n')
        fs.writeFileSync(dumpPath, sql, { mode: 0o600 })
        fs.writeFileSync(path.join(resolvedDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 })
        await source.query('ROLLBACK')
        printCounts('Exported local snapshot row counts', tables, counts)
        console.log(`\nExport directory: ${resolvedDirectory}`)
        console.log(`SQL export size: ${Buffer.byteLength(sql)} bytes`)
    } finally {
        await source.end()
    }
}

function prepareBrowserImport(directory, live) {
    const sourceTables = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'))
    if (!Array.isArray(live.tables) || !Array.isArray(live.externalReferences) || live.externalReferences.length) {
        throw new Error('Live inventory is invalid or external foreign-key dependencies prevent safe replacement.')
    }
    const targetByKey = new Map(live.tables.map(table => [tableKey(table), table]))
    const missingTables = []
    for (const table of sourceTables) {
        const target = targetByKey.get(tableKey(table))
        if (!target) missingTables.push(table)
        else if ([...table.columns].sort().join('\n') !== [...target.columns].sort().join('\n')) {
            throw new Error(`Column mismatch for ${tableKey(table)}. No import was prepared.`)
        }
        if (!Number.isSafeInteger(table.count) || table.count < 0) throw new Error('Invalid source row count.')
    }
    if (live.tables.some(table => !sourceTables.some(source => tableKey(source) === tableKey(table)))) {
        throw new Error('Live-only tables require an explicit migration plan before replacement.')
    }
    const stripMetaCommands = sql => sql.split(/\r?\n/)
        .filter(line => !/^\\(?:un)?restrict\s+[A-Za-z0-9]+\s*$/.test(line)).join('\n')
    let schemaSql = ''
    if (missingTables.length) {
        const schemaPath = path.join(directory, 'missing-tables.sql')
        runPgDump(getClientConfig(localEnvPath), [
            '--schema-only', ...missingTables.map(table => `--table=${tableKey(table)}`), `--file=${schemaPath}`,
        ])
        schemaSql = stripMetaCommands(fs.readFileSync(schemaPath, 'utf8'))
    }
    const backupSchema = `wfh_backup_${new Date().toISOString().slice(0, 10).replaceAll('-', '')}_${randomUUID().slice(0, 8)}`
    const statements = [
        'BEGIN;', "SET LOCAL lock_timeout = '15s';", "SET LOCAL statement_timeout = '120s';",
        `LOCK TABLE ${live.tables.map(quoteTable).join(', ')} IN ACCESS EXCLUSIVE MODE;`,
        `CREATE SCHEMA ${quoteIdentifier(backupSchema)};`,
        `REVOKE ALL ON SCHEMA ${quoteIdentifier(backupSchema)} FROM PUBLIC, anon, authenticated;`,
        'CREATE TEMP TABLE wfh_sync_auth_count ON COMMIT DROP AS SELECT count(*) AS count FROM auth.users;',
        ...live.tables.map(table => `CREATE TABLE ${quoteIdentifier(backupSchema)}.${quoteIdentifier(`${table.schema}__${table.name}`)} AS TABLE ${quoteTable(table)};`),
        `REVOKE ALL ON ALL TABLES IN SCHEMA ${quoteIdentifier(backupSchema)} FROM PUBLIC, anon, authenticated;`,
        schemaSql,
        `CREATE TEMP TABLE wfh_sync_triggers ON COMMIT DROP AS
         SELECT n.nspname AS schema_name, c.relname AS table_name, t.tgname, t.tgenabled
         FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname IN ('app','app_auth') AND NOT t.tgisinternal;`,
        ...sourceTables.map(table => `ALTER TABLE ${quoteTable(table)} DISABLE TRIGGER USER;`),
        `TRUNCATE TABLE ${sourceTables.map(quoteTable).join(', ')} RESTART IDENTITY;`,
        stripMetaCommands(fs.readFileSync(path.join(directory, 'data.sql'), 'utf8')),
        `UPDATE app_auth.users u SET supabase_auth_user_id = NULL
         WHERE u.supabase_auth_user_id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM auth.users a WHERE a.id=u.supabase_auth_user_id
             AND lower(a.email)=lower(u.email::text) AND a.email_confirmed_at IS NOT NULL);`,
        `UPDATE app_auth.users u SET supabase_auth_user_id = a.id FROM auth.users a
         WHERE lower(a.email)=lower(u.email::text) AND a.email_confirmed_at IS NOT NULL
           AND u.supabase_auth_user_id IS DISTINCT FROM a.id;`,
        `DO $restore_triggers$ DECLARE trigger_row record; BEGIN
         FOR trigger_row IN SELECT * FROM pg_temp.wfh_sync_triggers LOOP
           EXECUTE format('ALTER TABLE %I.%I %s TRIGGER %I', trigger_row.schema_name, trigger_row.table_name,
             CASE trigger_row.tgenabled WHEN 'D' THEN 'DISABLE' WHEN 'R' THEN 'ENABLE REPLICA' WHEN 'A' THEN 'ENABLE ALWAYS' ELSE 'ENABLE' END,
             trigger_row.tgname);
         END LOOP; END; $restore_triggers$;`,
        `DO $verify_counts$ BEGIN
         ${sourceTables.map(table => `IF (SELECT count(*) FROM ${quoteTable(table)}) <> ${table.count} THEN RAISE EXCEPTION 'Row count mismatch for ${tableKey(table)}'; END IF;`).join('\n')}
         IF (SELECT count(*) FROM auth.users) <> (SELECT count FROM pg_temp.wfh_sync_auth_count) THEN
           RAISE EXCEPTION 'Supabase Auth account count changed during sync'; END IF;
         IF to_regprocedure('api.wfh_pulse_request(text,text,jsonb,jsonb)') IS NULL THEN RAISE EXCEPTION 'REST RPC is missing'; END IF;
         END; $verify_counts$;`,
        `SELECT jsonb_build_object('status','synced','tables',${sourceTables.length},
           'rows',${sourceTables.reduce((total, table) => total + table.count, 0)},
           'employees',(SELECT count(*) FROM app.employees), 'attendance',(SELECT count(*) FROM app.attendance_records),
           'supabaseAuthUsers',(SELECT count(*) FROM auth.users), 'backupSchema','${backupSchema}',
           'linkedAccounts',(SELECT count(*) FROM app_auth.users WHERE supabase_auth_user_id IS NOT NULL)) AS sync_result;`,
        'COMMIT;',
    ]
    fs.writeFileSync(path.join(directory, 'import.sql'), statements.join('\n\n'), { mode: 0o600 })
    const summary = { backupSchema, tables: sourceTables.length, rows: sourceTables.reduce((total, table) => total + table.count, 0), migratedTables: missingTables.map(tableKey) }
    fs.writeFileSync(path.join(directory, 'import-summary.json'), JSON.stringify(summary, null, 2), { mode: 0o600 })
    return summary
}

function serveBrowserExport(directory) {
    const prefix = `/${randomUUID()}`
    const server = createServer(async (request, response) => {
        const url = new URL(request.url, 'http://127.0.0.1')
        const origin = `http://127.0.0.1:${server.address().port}`
        if (!url.pathname.startsWith(`${prefix}/`) || (request.headers.origin && request.headers.origin !== origin)) {
            response.writeHead(403).end()
            return
        }
        response.setHeader('Cache-Control', 'no-store')
        response.setHeader('X-Content-Type-Options', 'nosniff')
        try {
            if (request.method === 'POST' && url.pathname === `${prefix}/prepare`) {
                const chunks = []
                let size = 0
                for await (const chunk of request) {
                    size += chunk.length
                    if (size > 1000000) throw new Error('Inventory payload is too large.')
                    chunks.push(chunk)
                }
                const summary = prepareBrowserImport(directory, JSON.parse(Buffer.concat(chunks).toString('utf8')))
                response.setHeader('Content-Type', 'application/json')
                response.end(JSON.stringify(summary))
            } else if (request.method === 'GET' && url.pathname === `${prefix}/`) {
                response.setHeader('Content-Type', 'text/html')
                response.end('<!doctype html><title>Local migration transfer</title>')
            } else if (request.method === 'GET' && ['import.sql', 'manifest.json'].some(name => url.pathname === `${prefix}/${name}`)) {
                const fileName = url.pathname.split('/').pop()
                response.setHeader('Content-Type', 'text/plain; charset=utf-8')
                response.end(fs.readFileSync(path.join(directory, fileName)))
            } else response.writeHead(404).end()
        } catch (error) {
            response.writeHead(400, { 'Content-Type': 'application/json' })
            response.end(JSON.stringify({ error: error.message }))
        }
    })
    server.listen(0, '127.0.0.1', () => console.log(`Private transfer URL: http://127.0.0.1:${server.address().port}${prefix}/`))
}

async function main() {
    const serveIndex = process.argv.indexOf('--serve-export')
    if (serveIndex >= 0) {
        const directory = process.argv[serveIndex + 1]
        if (!directory || directory.startsWith('--')) throw new Error('Provide an export directory after --serve-export.')
        serveBrowserExport(path.resolve(directory))
        return
    }
    const exportIndex = process.argv.indexOf('--export-sql')
    if (exportIndex >= 0) {
        const directory = process.argv[exportIndex + 1]
        if (!directory || directory.startsWith('--')) throw new Error('Provide an external directory after --export-sql.')
        await exportLocalSql(directory)
        return
    }
    const dryRun = process.argv.slice(2).includes('--dry-run')
    const source = new Client(getClientConfig(localEnvPath))
    const target = new Client(getClientConfig(supabaseEnvPath))

    await Promise.all([source.connect(), target.connect()])
    try {
        const [sourceTables, targetTables] = await Promise.all([
            getTables(source),
            getTables(target),
        ])
        await validateCompatibility(source, target, sourceTables, targetTables)

        const [sourceCounts, targetCounts, insertOrder] = await Promise.all([
            getCounts(source, sourceTables),
            getCounts(target, sourceTables),
            getInsertOrder(target, sourceTables),
        ])
        printCounts('Local row counts', sourceTables, sourceCounts)
        printCounts('Current Supabase row counts', sourceTables, targetCounts)

        if (dryRun) {
            console.log('\nDry run passed. No Supabase data was changed.')
            return
        }

        console.log(
            '\nReplacing Supabase app and app_auth data from local PostgreSQL...'
        )
        await target.query('BEGIN')
        try {
            await setUserTriggers(target, sourceTables, false)
            await target.query(
                `TRUNCATE TABLE ${sourceTables.map(quoteTable).join(', ')} RESTART IDENTITY CASCADE`
            )

            for (const table of insertOrder) {
                const copied = await copyTable(source, target, table)
                console.log(`Copied ${tableKey(table)}: ${copied}`)
            }

            await resetSequences(target, sourceTables)
            await setUserTriggers(target, sourceTables, true)
            await target.query('COMMIT')
        } catch (error) {
            await target.query('ROLLBACK')
            throw error
        }

        const finalCounts = await getCounts(target, sourceTables)
        const mismatches = sourceTables.filter(
            table =>
                sourceCounts.get(tableKey(table)) !==
                finalCounts.get(tableKey(table))
        )
        printCounts('Synced Supabase row counts', sourceTables, finalCounts)

        if (mismatches.length > 0) {
            throw new Error(
                `Row count mismatch after sync: ${mismatches.map(tableKey).join(', ')}`
            )
        }

        console.log('\nLocal application data is now synced to Supabase.')
    } finally {
        await Promise.all([source.end(), target.end()])
    }
}

main().catch(error => {
    console.error('\nData sync failed.')
    console.error(error.message)
    process.exitCode = 1
})
