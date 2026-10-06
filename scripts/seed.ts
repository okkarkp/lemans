import { Client } from "pg";
import { SEED_DEMO_NOW, seedDatabase } from "./lib/seed-data";

async function main() {
  const db = new Client({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL });
  await db.connect();
  try {
    const { events } = await seedDatabase(db);
    console.log(`Seeded demo data: ${events} events. Demo clock: ${SEED_DEMO_NOW} SGT.`);
  } finally {
    await db.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
