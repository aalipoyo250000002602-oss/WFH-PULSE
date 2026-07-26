import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const envFilePath = path.resolve(process.cwd(), "database", ".env.local.postgres");

function parseBoolean(value, defaultValue = false) {
  if (value == null || value === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function loadLocalEnvFile() {
  if (!fs.existsSync(envFilePath)) {
    return;
  }

  const content = fs.readFileSync(envFilePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const rawValue = trimmed.slice(eqIndex + 1).trim();
    const value = rawValue.replace(/^['\"]|['\"]$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadLocalEnvFile();

export function getPostgresConfig() {
  const host = process.env.PGHOST ?? "127.0.0.1";
  const port = Number(process.env.PGPORT ?? "5432");
  const database = process.env.PGDATABASE ?? "wfh_pulse";
  const user = process.env.PGUSER ?? "postgres";
  const password = process.env.PGPASSWORD ?? "postgres";
  const useSSL = parseBoolean(process.env.PGSSL, false);

  return {
    host,
    port,
    database,
    user,
    password,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
    application_name: "wfh-pulse-db-config",
  };
}

export function getSafeConfigPreview() {
  const config = getPostgresConfig();
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    ssl: Boolean(config.ssl),
    envFilePath,
  };
}

