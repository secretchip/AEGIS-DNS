/**
 * Applies the generated SQL migrations in ./drizzle to the SQLite database.
 * Run `npm run db:generate` first to (re)generate migrations from schema.ts.
 */
import "./load-env";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const dbPath = process.env.DATABASE_PATH ?? "./data/aegis-dash.sqlite";
const dir = dirname(dbPath);
if (dir && !existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite);

migrate(db, { migrationsFolder: "./drizzle" });
console.log(`Migrations applied to ${dbPath}`);
sqlite.close();
