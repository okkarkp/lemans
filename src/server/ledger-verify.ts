// No "server-only": the nightly verification script reuses this outside Next.js.
import type { ClientBase } from "pg";
import { GENESIS_HASH, ledgerHash } from "./domain/hash";

const BATCH = 2_000;
const CHECKPOINT_EVERY = 500;

export type VerifyResult =
  | { ok: true; count: number; head: string | null; from: number; full: boolean; lastFull: string | null }
  | { ok: false; brokenAt: number; count: number; full: boolean; lastFull: string | null };

/**
 * Recomputes the chain in batches (bounded memory). Quick mode starts at the latest checkpoint
 * and first confirms that checkpoint still matches the ledger; full mode starts at genesis.
 * A clean run that has moved far enough past the last checkpoint records a new one.
 */
export async function verifyLedgerChain(db: ClientBase, opts: { full: boolean }): Promise<VerifyResult> {
  const count = Number((await db.query("SELECT count(*) AS n FROM ledger_entry")).rows[0].n);
  const lastFullRow = (await db.query("SELECT max(verified_at) AS t FROM ledger_checkpoint WHERE full_verify")).rows[0];
  const lastFull = lastFullRow.t ? (lastFullRow.t as Date).toISOString() : null;
  let from = 0;
  let prev = GENESIS_HASH;

  if (!opts.full) {
    const cp = (await db.query("SELECT seq, hash FROM ledger_checkpoint ORDER BY seq DESC, id DESC LIMIT 1")).rows[0];
    if (cp) {
      const at = (await db.query("SELECT hash FROM ledger_entry WHERE seq = $1", [cp.seq])).rows[0];
      if (!at || at.hash !== cp.hash) return { ok: false, brokenAt: Number(cp.seq), count, full: false, lastFull };
      from = Number(cp.seq);
      prev = cp.hash;
    }
  }

  let expectedSeq = from + 1;
  for (;;) {
    const rows = (await db.query("SELECT * FROM ledger_entry WHERE seq > $1 ORDER BY seq LIMIT $2", [expectedSeq - 1, BATCH])).rows;
    if (rows.length === 0) break;
    for (const r of rows) {
      const seq = Number(r.seq);
      const entry = { seq, occurredAt: (r.occurred_at as Date).toISOString(), actorId: r.actor_id, eventType: r.event_type, payload: r.payload, prevHash: r.prev_hash };
      // A missing sequence number means an entry was removed.
      if (seq !== expectedSeq || r.prev_hash !== prev || ledgerHash(entry) !== r.hash) {
        return { ok: false, brokenAt: seq !== expectedSeq ? expectedSeq : seq, count, full: opts.full, lastFull };
      }
      prev = r.hash;
      expectedSeq++;
    }
  }
  const head = expectedSeq > 1 ? prev : null;
  const headSeq = expectedSeq - 1;
  // Removing the newest entries leaves a valid-looking chain; a checkpoint beyond the head exposes it.
  const maxCp = Number((await db.query("SELECT coalesce(max(seq), 0) AS m FROM ledger_checkpoint")).rows[0].m);
  if (maxCp > headSeq) return { ok: false, brokenAt: headSeq + 1, count, full: opts.full, lastFull };
  if (head && (opts.full || headSeq - from >= CHECKPOINT_EVERY)) {
    await db.query("INSERT INTO ledger_checkpoint (seq, hash, full_verify) VALUES ($1, $2, $3)", [headSeq, head, opts.full]);
  }
  return { ok: true, count, head, from, full: opts.full, lastFull: opts.full ? new Date().toISOString() : lastFull };
}
