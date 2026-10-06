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

const EXPORT_MAX_ROWS = 100_000;

/** Ledger entries in a business-time range, for an auditor. Formula-injection-safe CSV. */
export async function exportLedgerCsv(from: string, to: string): Promise<string> {
  const r = await pool().query(
    `SELECT * FROM ledger_entry WHERE occurred_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Singapore')
       AND occurred_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Singapore') ORDER BY seq LIMIT $3`,
    [from, to, EXPORT_MAX_ROWS + 1]);
  if (r.rows.length > EXPORT_MAX_ROWS) throw new Error(`More than ${EXPORT_MAX_ROWS} entries: choose a shorter range.`);
  const cell = (x: unknown) => {
    let s = String(x ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["seq", "occurred_at", "recorded_at", "actor_id", "event_type", "payload", "prev_hash", "hash"];
  const lines = r.rows.map(mapLedgerRow).map((e) =>
    [e.seq, e.occurredAt, e.recordedAt, e.actorId, e.eventType, JSON.stringify(e.payload), e.prevHash, e.hash].map(cell).join(","));
  return [head.join(","), ...lines].join("\r\n") + "\r\n";
}

/**
 * A small statement of the ledger's state - entry count and head hash - to keep outside the
 * database (printed, emailed or filed). Any later rewrite of history will not match it.
 */
export async function ledgerDigest() {
  const head = (await pool().query("SELECT seq, hash, occurred_at FROM ledger_entry ORDER BY seq DESC LIMIT 1")).rows[0];
  const check = await verifyLedger({ full: true });
  return {
    generatedAt: new Date().toISOString(),
    entries: head ? Number(head.seq) : 0,
    headSeq: head ? Number(head.seq) : null,
    headHash: head?.hash ?? null,
    lastEventAt: head ? (head.occurred_at as Date).toISOString() : null,
    chainVerified: check.ok,
    algorithm: "SHA-256 over canonical JSON of {seq, occurredAt, actorId, eventType, payload, prevHash}",
  };
}
