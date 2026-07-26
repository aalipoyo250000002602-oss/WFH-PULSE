import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";
import { getPostgresConfig, getSafeConfigPreview } from "./db.config.mjs";

const migrationsDir = path.resolve(process.cwd(), "database", "migrations");

function parseArgs(argv) {
  const command = argv[0] ?? "up";
  const options = new Set(argv.slice(1));
  return {
    command,
    dryRun: options.has("--dry-run"),
  };
}

async function listMigrationBaseNames() {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const fileNames = entries.filter((e) => e.isFile()).map((e) => e.name);

  const baseNames = new Set();
  for (const name of fileNames) {
    if (name.endsWith(".up.sql")) {
      baseNames.add(name.slice(0, -7));
    }
  }

  return [...baseNames].sort();
}

async function expandSql(filePath, seen = new Set()) {
  const normalized = path.resolve(filePath);
  if (seen.has(normalized)) {
    throw new Error(`Recursive include detected: ${normalized}`);
  }

  seen.add(normalized);
  const raw = await fs.readFile(normalized, "utf8");
  const lines = raw.split(/\r?\n/);
  const chunks = [];

  for (const line of lines) {
    const match = line.match(/^\s*--\s*include:\s*(.+)$/i);
    if (!match) {
      chunks.push(line);
      continue;
    }

    const includePath = path.resolve(path.dirname(normalized), match[1].trim());
    chunks.push(await expandSql(includePath, seen));
  }

  seen.delete(normalized);
  return chunks.join("\n");
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedVersions(client) {
  const result = await client.query(
    "SELECT version FROM public.schema_migrations ORDER BY version ASC",
  );
  return new Set(result.rows.map((row) => row.version));
}

async function applyMigration(client, version) {
  const upPath = path.join(migrationsDir, `${version}.up.sql`);
  const sql = await expandSql(upPath);

  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      "INSERT INTO public.schema_migrations (version) VALUES ($1)",
      [version],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function rollbackMigration(client, version) {
  const downPath = path.join(migrationsDir, `${version}.down.sql`);
  const sql = await expandSql(downPath);

  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("DELETE FROM public.schema_migrations WHERE version = $1", [version]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function runDryMode(command) {
  const versions = await listMigrationBaseNames();
  console.log("Dry run mode: no database changes will be made.");
  console.log("Config preview:");
  console.log(JSON.stringify(getSafeConfigPreview(), null, 2));
  console.log(`Command: ${command}`);
  console.log("Discovered migrations:");
  for (const version of versions) {
    console.log(`- ${version}`);
  }
}

async function run() {
  const { command, dryRun } = parseArgs(process.argv.slice(2));

  if (!new Set(["up", "down", "status"]).has(command)) {
    throw new Error("Invalid command. Use: up | down | status");
  }

  if (dryRun) {
    await runDryMode(command);
    return;
  }

  const client = new Client(getPostgresConfig());
  await client.connect();

  try {
    await ensureMigrationsTable(client);
    const versions = await listMigrationBaseNames();
    const applied = await getAppliedVersions(client);

    if (command === "status") {
      for (const version of versions) {
        console.log(`${applied.has(version) ? "applied" : "pending"} ${version}`);
      }
      return;
    }

    if (command === "up") {
      const pending = versions.filter((version) => !applied.has(version));
      if (pending.length === 0) {
        console.log("No pending migrations.");
        return;
      }

      for (const version of pending) {
        console.log(`Applying ${version} ...`);
        await applyMigration(client, version);
        console.log(`Applied ${version}.`);
      }
      return;
    }

    const appliedInOrder = versions.filter((version) => applied.has(version));
    const latest = appliedInOrder.at(-1);

    if (!latest) {
      console.log("No applied migrations to rollback.");
      return;
    }

    console.log(`Rolling back ${latest} ...`);
    await rollbackMigration(client, latest);
    console.log(`Rolled back ${latest}.`);
  } finally {
    await client.end().catch(() => {
      // Ignore close errors.
    });
  }
}

run().catch((error) => {
  console.error("Migration command failed.");
  console.error(error.message);
  process.exitCode = 1;
});


