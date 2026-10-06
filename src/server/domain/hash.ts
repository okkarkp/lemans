import { createHash } from "node:crypto";

export const GENESIS_HASH = "0".repeat(64);

/** Deterministic JSON: object keys sorted at every level, so the hash never depends on key order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export interface HashableEntry {
  seq: number;
  occurredAt: string;
  actorId: string;
  eventType: string;
  payload: unknown;
  prevHash: string;
}

export function ledgerHash(e: HashableEntry): string {
  return createHash("sha256").update(canonicalJson(e)).digest("hex");
}

export function verifyChain(entries: (HashableEntry & { hash: string })[]): { ok: true } | { ok: false; brokenAt: number } {
  let prev = GENESIS_HASH;
  for (const e of entries) {
    const { hash, ...rest } = e;
    if (e.prevHash !== prev || ledgerHash(rest) !== hash) return { ok: false, brokenAt: e.seq };
    prev = hash;
  }
  return { ok: true };
}
