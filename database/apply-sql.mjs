import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";
import { getPostgresConfig, getSafeConfigPreview } from "./db.config.mjs";

const rootDir = process.cwd();
const schemaFile = path.resolve(rootDir, "database", "01_schema_postgresql18.sql");
const seedFile = path.resolve(rootDir, "database", "02_seed_postgresql18.sql");

function parseArgs(argv) {
  const args = new Set(argv);
  return {
    dryRun: args.has("--dry-run"),
    schemaOnly: args.has("--schema-only"),
    seedOnly: args.has("--seed-only"),
  };
}

async function readSql(filePath) {
  return fs.readFile(filePath, "utf8");
}

async function run() {
  const { dryRun, schemaOnly, seedOnly } = parseArgs(process.argv.slice(2));

  if (schemaOnly && seedOnly) {
    throw new Error("Use either --schema-only or --seed-only, not both.");
  }

  const filesToRun = [];
  if (!seedOnly) filesToRun.push(schemaFile);
  if (!schemaOnly) filesToRun.push(seedFile);

  if (dryRun) {
    console.log("Dry run mode: no database changes will be made.");
    console.log("Config preview:");
    console.log(JSON.stringify(getSafeConfigPreview(), null, 2));
    console.log("SQL files:");
    for (const file of filesToRun) {
      const sql = await readSql(file);
      console.log(`- ${file} (${sql.length} chars)`);
    }
    return;
  }

  const config = getPostgresConfig();
  const client = new Client(config);

  try {
    await client.connect();

    for (const file of filesToRun) {
      const sql = await readSql(file);
      console.log(`Applying ${path.basename(file)} ...`);
      await client.query(sql);
      console.log(`Applied ${path.basename(file)} successfully.`);
    }

    console.log("Database setup finished.");
  } finally {
    await client.end().catch(() => {
      // Ignore close errors if connect failed.
    });
  }
}

run().catch((error) => {
  console.error("Failed to apply SQL files.");
  console.error(error.message);
  process.exitCode = 1;
});

