import { Client } from "pg";
import { runMigrations } from "./lib/migrations";

async function main() {
  const reset = process.argv.includes("--reset");
  if (reset && process.env.DEMO_MODE !== "true") throw new Error("--reset is only allowed when DEMO_MODE=true");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await runMigrations(client, { reset, log: console.log });
  } finally {
    await client.end();
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
