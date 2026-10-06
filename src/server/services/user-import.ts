import "server-only";
import { withTx } from "../db";
import { now } from "../clock";
import { appendLedger } from "../ledger";
import { parseCsv } from "../domain/csv";
import { AppError, badRequest } from "../errors";
import type { CurrentUser } from "../auth/session";
import { createUserInput, createUserTx, USER_LOCK } from "./users";

export const IMPORT_COLUMNS = ["login_id", "name", "role", "email", "team", "job_title", "start_date"] as const;
const MAX_ROWS = 500;

export interface ImportRowResult { line: number; loginId: string; ok: boolean; message: string }

class DryRun extends Error {}

/**
 * All-or-nothing import. Every row is validated and then created in one transaction; any error
 * rolls back the whole file. A dry run executes the same transaction and always rolls it back, so
 * it catches database-level problems (taken IDs, unknown teams) as well as format errors.
 * Administrator accounts cannot be imported: they need a second administrator's approval.
 */
export async function importUsers(admin: CurrentUser, csv: string, dryRun: boolean): Promise<{ applied: boolean; rows: ImportRowResult[] }> {
  let table: string[][];
  try { table = parseCsv(csv); } catch (e) { throw badRequest("BAD_CSV", (e as Error).message); }
  if (table.length < 2) throw badRequest("EMPTY", "The file needs a header row and at least one user.");
  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = IMPORT_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw badRequest("BAD_HEADER", `Missing column(s): ${missing.join(", ")}.`);
  if (table.length - 1 > MAX_ROWS) throw badRequest("TOO_MANY", `At most ${MAX_ROWS} users per file.`);
  const col = (r: string[], c: (typeof IMPORT_COLUMNS)[number]) => (r[header.indexOf(c)] ?? "").trim();

  const results: ImportRowResult[] = [];
  const seen = new Set<string>();
  const parsed = table.slice(1).map((r, i) => {
    const line = i + 2;
    const raw = {
      id: col(r, "login_id"), displayName: col(r, "name"), role: col(r, "role").toUpperCase(),
      email: col(r, "email") || undefined, teamId: col(r, "team").toUpperCase() || undefined,
      roleTitle: col(r, "job_title") || undefined, startDate: col(r, "start_date") || undefined,
    };
    const v = createUserInput.safeParse(raw);
    let message = v.success ? "" : v.error.issues.map((x) => x.message).join(" ");
    if (v.success && v.data.role === "ADMIN") message = "Administrator accounts cannot be imported; create them individually.";
    if (v.success && seen.has(v.data.id)) message = "This login ID appears more than once in the file.";
    if (v.success) seen.add(v.data.id);
    return { line, loginId: raw.id, data: v.success && !message ? v.data : null, message };
  });

  if (parsed.some((p) => !p.data)) {
    // Rows that pass here have only had their format checked; say so rather than "valid".
    return { applied: false, rows: parsed.map((p) => ({ line: p.line, loginId: p.loginId, ok: !p.message, message: p.message || "Format OK (not yet checked against existing data)" })) };
  }
  try {
    await withTx(async (tx) => {
      const n = await now(tx);
      await tx.query("SELECT pg_advisory_xact_lock($1)", [USER_LOCK]);
      for (const p of parsed) {
        try {
          const r = await createUserTx(tx, admin, p.data!, n.instant);
          results.push({ line: p.line, loginId: p.loginId, ok: true, message: r.personnelId ? `Will be ${r.personnelId}` : "Valid" });
        } catch (e) {
          if (!(e instanceof AppError)) throw e;
          results.push({ line: p.line, loginId: p.loginId, ok: false, message: e.message });
        }
      }
      if (results.some((r) => !r.ok) || dryRun) throw new DryRun();
      await appendLedger(tx, { actorId: admin.id, eventType: "USERS_IMPORTED", occurredAt: n.instant, payload: { count: results.length } });
    });
  } catch (e) {
    if (e instanceof DryRun) return { applied: false, rows: results };
    throw e;
  }
  return { applied: true, rows: results.map((r) => ({ ...r, message: r.message.replace("Will be", "Created as") })) };
}
