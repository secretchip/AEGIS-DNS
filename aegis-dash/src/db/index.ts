import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_PATH ?? "./data/aegis-dash.sqlite";

// Ensure the parent directory exists before better-sqlite3 opens the file.
const dir = dirname(dbPath);
if (dir && !existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

// Reuse a single connection across hot reloads in dev.
const globalForDb = globalThis as unknown as {
  __aegisSqlite?: Database.Database;
};

const sqlite =
  globalForDb.__aegisSqlite ?? new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

if (process.env.NODE_ENV !== "production") {
  globalForDb.__aegisSqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });
export { schema };
