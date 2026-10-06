import "server-only";
import { pool } from "../db";
import { verifyChain } from "../domain/hash";
import { mapLedgerRow, type LedgerRow } from "../ledger";

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

/**
 * Recomputes every hash from genesis. Fine at current volume; production would verify from a
 * signed checkpoint and anchor the head hash outside the database.
 */
export async function verifyLedger() {
  const r = await pool().query("SELECT * FROM ledger_entry ORDER BY seq");
  const entries = r.rows.map(mapLedgerRow);
  // Pass exactly the hashed fields; recordedAt is wall-clock metadata and is not part of the hash.
  const result = verifyChain(entries.map((e) => ({
    seq: e.seq, occurredAt: e.occurredAt, actorId: e.actorId, eventType: e.eventType, payload: e.payload, prevHash: e.prevHash, hash: e.hash,
  })));
  return { ...result, count: entries.length, head: entries.at(-1)?.hash ?? null };
}
