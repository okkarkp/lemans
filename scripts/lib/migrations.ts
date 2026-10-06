import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ClientBase } from "pg";

const dir = path.join(__dirname, "..", "..", "db", "migrations");

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
