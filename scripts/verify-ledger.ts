// Nightly full verification. Exit code 0 = intact, 2 = broken: suitable for cron and monitoring.
import { Client } from "pg";
import { verifyLedgerChain } from "../src/server/ledger-verify";

async function main() {
  // Runs as the application role: it may add checkpoints but cannot alter the ledger.
  const db = new Client({ connectionString: process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL });
  await db.connect();
  try {
    const r = await verifyLedgerChain(db, { full: true });
    if (r.ok) console.log(`LEDGER OK: ${r.count} entries verified from genesis; head ${r.head?.slice(0, 16)}`);
    else { console.error(`LEDGER BROKEN at entry #${r.brokenAt} (${r.count} entries)`); process.exitCode = 2; }
  } finally {
    await db.end();
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
