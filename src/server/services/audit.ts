import "server-only";
import { pool } from "../db";
import { mapLedgerRow, type LedgerRow } from "../ledger";
import { verifyLedgerChain } from "../ledger-verify";

const PAGE_SIZE = 50;

export async function ledgerPage(page: number): Promise<{ rows: LedgerRow[]; total: number; pageSize: number }> {
  const db = pool();
  const safePage = Math.max(1, Math.floor(page) || 1);
  const [rows, count] = await Promise.all([
    db.query("SELECT * FROM ledger_entry ORDER BY seq DESC LIMIT $1 OFFSET $2", [PAGE_SIZE, (safePage - 1) * PAGE_SIZE]),
    db.query<{ n: string }>("SELECT count(*) AS n FROM ledger_entry"),
  ]);
  return { rows: rows.rows.map(mapLedgerRow), total: Number(count.rows[0].n), pageSize: PAGE_SIZE };
}

/** Quick by default (from the latest checkpoint); `full` recomputes from the first entry. */
export async function verifyLedger(opts: { full?: boolean } = {}) {
  const client = await pool().connect();
  try {
    return await verifyLedgerChain(client, { full: opts.full ?? false });
  } finally {
    client.release();
  }
}
