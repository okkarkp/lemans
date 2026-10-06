import "server-only";
import { z } from "zod";
import { pool, withTx, type Db } from "../db";
import { now } from "../clock";
import { appendLedger } from "../ledger";
import { BALANCED_TYPES, computeBalance, type Balance, type BalancedType } from "../domain/leave-balance";
import { notFound } from "../errors";
import type { CurrentUser } from "../auth/session";

export const entitlementInput = z.object({
  year: z.number().int().min(2000).max(2100),
  ANNUAL: z.number().min(0).max(365).multipleOf(0.5),
  MEDICAL: z.number().min(0).max(365).multipleOf(0.5),
  CHILDCARE: z.number().min(0).max(365).multipleOf(0.5),
});

/** Balance for one type and calendar year: approved and pending days both count against it. */
export async function balanceFor(db: Db, personnelId: string, year: number, leaveType: BalancedType): Promise<Balance> {
  const [ent, used] = [
    await db.query("SELECT days FROM leave_entitlement WHERE personnel_id = $1 AND year = $2 AND leave_type = $3", [personnelId, year, leaveType]),
    await db.query(
      `SELECT coalesce(sum(days) FILTER (WHERE status = 'APPROVED'), 0) AS approved,
              coalesce(sum(days) FILTER (WHERE status = 'PENDING'), 0) AS pending
       FROM leave_request WHERE personnel_id = $1 AND leave_type = $3 AND extract(year FROM start_date) = $2`, [personnelId, year, leaveType]),
  ];
  return computeBalance(leaveType, ent.rows[0] ? Number(ent.rows[0].days) : null, Number(used.rows[0].approved), Number(used.rows[0].pending));
}

export async function balances(personnelId: string, year: number): Promise<Balance[]> {
  const db = pool();
  const out: Balance[] = [];
  for (const t of BALANCED_TYPES) out.push(await balanceFor(db, personnelId, year, t));
  return out;
}

export async function setEntitlements(admin: CurrentUser, personnelId: string, input: z.infer<typeof entitlementInput>) {
  return withTx(async (tx) => {
    const n = await now(tx);
    if (!(await tx.query("SELECT 1 FROM personnel WHERE id = $1", [personnelId])).rowCount) throw notFound("Service personnel");
    for (const t of BALANCED_TYPES) {
      await tx.query(
        `INSERT INTO leave_entitlement (personnel_id, year, leave_type, days, set_by, set_at) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (personnel_id, year, leave_type) DO UPDATE SET days = EXCLUDED.days, set_by = EXCLUDED.set_by, set_at = EXCLUDED.set_at`,
        [personnelId, input.year, t, input[t], admin.id, n.instant]);
    }
    await appendLedger(tx, { actorId: admin.id, eventType: "ENTITLEMENT_SET", occurredAt: n.instant, payload: { personnelId, ...input } });
  });
}
