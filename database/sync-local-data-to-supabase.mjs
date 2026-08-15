import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
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

async function main() {
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
