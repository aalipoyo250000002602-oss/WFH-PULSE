import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const dbDir = path.resolve(rootDir, "database");
const localEnvPath = path.resolve(dbDir, ".env.local.postgres");
const supabaseEnvPath = path.resolve(dbDir, ".env.local.supabase");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing env file: ${filePath}`);
  }

  const env = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const idx = trimmed.indexOf("=");
    if (idx < 0) {
      continue;
    }

    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['\"]|['\"]$/g, "");
    env[key] = value;
  }

  return env;
}

function runCommand(label, command, args, env, dryRun) {
  const pretty = `${command} ${args.join(" ")}`.trim();
  console.log(`\n[${label}] ${pretty}`);

  if (dryRun) {
    console.log(`[${label}] dry-run: skipped`);
    return;
  }

  const result = spawnSync(command, args, {
    cwd: rootDir,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error(`[${label}] failed with exit code ${result.status ?? "unknown"}`);
  }
}

function buildDbEnv(targetEnvPath) {
  const fileEnv = parseEnvFile(targetEnvPath);

  // Avoid cross-target contamination by clearing connection-string vars first.
  const env = {
    ...process.env,
    SUPABASE_DB_URL: "",
    DATABASE_URL: "",
    POSTGRES_URL: "",
    PGHOST: "",
    PGPORT: "",
    PGDATABASE: "",
    PGUSER: "",
    PGPASSWORD: "",
    PGSSL: "",
    ...fileEnv,
  };

  return env;
}

function runMigrations(label, targetEnvPath, dryRun) {
  const env = buildDbEnv(targetEnvPath);
  runCommand(label, "node", ["./database/migrate.mjs", "up"], env, dryRun);
}

function printUsage() {
  console.log("Usage: node ./scripts/build-sync-dbs.mjs [--dry-run] [--skip-build]");
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) {
    printUsage();
    return;
  }

  const dryRun = args.has("--dry-run");
  const skipBuild = args.has("--skip-build");

  console.log("WFH-PULSE smooth build + DB sync starting...");
  console.log(`dryRun=${dryRun} skipBuild=${skipBuild}`);

  if (!skipBuild) {
    runCommand("build", "corepack", ["pnpm", "run", "build"], process.env, dryRun);
  }

  runMigrations("db:local", localEnvPath, dryRun);
  runMigrations("db:supabase", supabaseEnvPath, dryRun);

  console.log("\nDone. Local and Supabase migrations are in sync.");
}

try {
  main();
} catch (error) {
  console.error("\nSync failed.");
  console.error(error.message);
  process.exitCode = 1;
}
