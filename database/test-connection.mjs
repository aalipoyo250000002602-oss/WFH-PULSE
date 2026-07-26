import process from "node:process";
import { Client } from "pg";
import { getPostgresConfig, getSafeConfigPreview } from "./db.config.mjs";

async function run() {
  const args = new Set(process.argv.slice(2));

  if (args.has("--check-config")) {
    console.log("PostgreSQL config check");
    console.log(JSON.stringify(getSafeConfigPreview(), null, 2));
    return;
  }

  const config = getPostgresConfig();
  const client = new Client(config);

  try {
    await client.connect();

    const versionResult = await client.query("SELECT version() AS version");
    const dbResult = await client.query("SELECT current_database() AS db");

    console.log("Connected to PostgreSQL successfully.");
    console.log(`Database: ${dbResult.rows[0].db}`);
    console.log(`Version: ${versionResult.rows[0].version}`);
  } catch (error) {
    console.error("Failed to connect to PostgreSQL.");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {
      // Ignore end() errors if connection never opened.
    });
  }
}

run();

