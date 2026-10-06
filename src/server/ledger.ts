// No "server-only" import: the seed script reuses this module outside Next.js.
import type { ClientBase } from "pg";
import { GENESIS_HASH, ledgerHash } from "./domain/hash";

const LEDGER_LOCK_KEY = 72_026_001;

export type LedgerEventType =
  | "CHECK_IN" | "CHECK_IN_REJECTED"
  | "LEAVE_REQUESTED" | "LEAVE_APPROVED" | "LEAVE_REJECTED"
  | "FOLLOW_UP" | "DAY_CORRECTED" | "REPORT_ACCEPTED"
  | "USER_CREATED" | "USER_UPDATED" | "USER_DEACTIVATED" | "USER_REACTIVATED"
  | "TEAM_CREATED" | "TEAM_UPDATED" | "DELEGATION_CREATED" | "DELEGATION_REVOKED"
  | "LEAVE_WITHDRAWN" | "LEAVE_CANCELLED" | "ATTACHMENT_ADDED" | "ENTITLEMENT_SET";

export interface LedgerRow {
  seq: number;
  occurredAt: string;
  recordedAt: string;
  actorId: string;
  eventType: string;
  payload: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

/**
 * Append one event to the hash chain. Must run inside the same transaction as the state change
 * it records, so the two can never diverge. The advisory lock serialises writers so the chain
 * has exactly one head.
 */
export async function appendLedger(
  tx: ClientBase,
  e: { actorId: string; eventType: LedgerEventType; payload: Record<string, unknown>; occurredAt: Date },
): Promise<{ seq: number; hash: string }> {
  await tx.query("SELECT pg_advisory_xact_lock($1)", [LEDGER_LOCK_KEY]);
  const head = await tx.query<{ seq: string; hash: string }>("SELECT seq, hash FROM ledger_entry ORDER BY seq DESC LIMIT 1");
  const seq = head.rows[0] ? Number(head.rows[0].seq) + 1 : 1;
  const prevHash = head.rows[0]?.hash ?? GENESIS_HASH;
  const occurredAt = e.occurredAt.toISOString();
  const hash = ledgerHash({ seq, occurredAt, actorId: e.actorId, eventType: e.eventType, payload: e.payload, prevHash });
  await tx.query(
    `INSERT INTO ledger_entry (seq, occurred_at, actor_id, event_type, payload, prev_hash, hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [seq, occurredAt, e.actorId, e.eventType, JSON.stringify(e.payload), prevHash, hash],
  );
  return { seq, hash };
}

export const mapLedgerRow = (r: Record<string, unknown>): LedgerRow => ({
  seq: Number(r.seq),
  occurredAt: (r.occurred_at as Date).toISOString(),
  recordedAt: (r.recorded_at as Date).toISOString(),
  actorId: r.actor_id as string,
  eventType: r.event_type as string,
  payload: r.payload as Record<string, unknown>,
  prevHash: r.prev_hash as string,
  hash: r.hash as string,
});
