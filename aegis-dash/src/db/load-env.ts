/**
 * Minimal .env loader for tsx-run scripts (migrate/seed). Next.js loads .env
 * itself, but standalone scripts do not. Dependency-free; does not override
 * variables already present in the environment.
 */
import { existsSync, readFileSync } from "node:fs";

const path = process.env.ENV_FILE ?? ".env";
if (existsSync(path)) {
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
