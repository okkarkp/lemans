import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ClientBase } from "pg";

// MIGRATIONS_DIR is set in the container image, where these scripts are bundled elsewhere.
const dir = process.env.MIGRATIONS_DIR ?? path.join(__dirname, "..", "..", "db", "migrations");

/** Applies pending SQL migrations in name order, each in its own transaction. */
export async function runMigrations(client: ClientBase, opts: { reset?: boolean; log?: (m: string) => void } = {}) {
  const log = opts.log ?? (() => {});
  if (opts.reset) {
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    log("Schema dropped and recreated.");
  }
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    await client.query("BEGIN");
    try {
      await client.query(readFileSync(path.join(dir, file), "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      log(`Applied ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    }
  }
}

/**
 * Creates (or updates the password of) the application's login role and grants it the
 * lemans_app_rw privileges from migration 003. Identifiers and the password are quoted by the
 * server with format(), never concatenated in JavaScript.
 */
export async function ensureAppRole(client: ClientBase, user: string, password: string) {
  if (!/^[a-z_][a-z0-9_]{2,62}$/.test(user)) throw new Error("APP_DB_USER must be a plain lower-case identifier");
  if (password.length < 16) throw new Error("APP_DB_PASSWORD must be at least 16 characters");
  const exists = (await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [user])).rowCount;
  const sql = (await client.query<{ s: string }>(
    exists ? "SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', $1::text, $2::text) AS s"
           : "SELECT format('CREATE ROLE %I WITH LOGIN PASSWORD %L', $1::text, $2::text) AS s",
    [user, password])).rows[0].s;
  await client.query(sql);
  const grant = (await client.query<{ s: string }>("SELECT format('GRANT lemans_app_rw TO %I', $1::text) AS s", [user])).rows[0].s;
  await client.query(grant);
}
