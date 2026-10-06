import { Client } from "pg";
import { ensureAppRole, runMigrations } from "./lib/migrations";

async function main() {
  const reset = process.argv.includes("--reset");
  if (reset && process.env.DEMO_MODE !== "true") throw new Error("--reset is only allowed when DEMO_MODE=true");
  // Migrations run as the schema owner; the app itself uses the restricted role.
  const client = new Client({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL });
  await client.connect();
  try {
    await runMigrations(client, { reset, log: console.log });
    const { APP_DB_USER, APP_DB_PASSWORD } = process.env;
    if (APP_DB_USER && APP_DB_PASSWORD) {
      await ensureAppRole(client, APP_DB_USER, APP_DB_PASSWORD);
      console.log(`Application role ${APP_DB_USER} is in place.`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
