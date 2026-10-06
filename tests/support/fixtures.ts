import type { CurrentUser } from "@/server/auth/session";
import type { TrustSignals } from "@/server/domain/checkin-policy";
import { pool } from "@/server/db";

export const personnel = (n: number): CurrentUser => {
  const id = `SP0${n}`;
  return { id: `u-${id.toLowerCase()}`, displayName: `Personnel 0${n}`, role: "PERSONNEL", personnelId: id };
};
export const supervisor: CurrentUser = { id: "u-sup01", displayName: "IRAS Supervisor (demo)", role: "SUPERVISOR", personnelId: null };
export const pmo: CurrentUser = { id: "u-pmo01", displayName: "Accenture PMO (demo)", role: "PMO", personnelId: null };

export const signals = (deviceManaged: boolean, network: "OFFICE" | "REMOTE"): TrustSignals =>
  ({ deviceManaged, network, deviceLabel: deviceManaged ? "WOG laptop" : "Personal phone", networkLabel: network });

export async function setClock(local: string) {
  await pool().query("UPDATE app_setting SET value = $1 WHERE key = 'demo_now'", [local]);
}

export async function ledgerCount(type?: string): Promise<number> {
  const r = type
    ? await pool().query("SELECT count(*)::int AS n FROM ledger_entry WHERE event_type = $1", [type])
    : await pool().query("SELECT count(*)::int AS n FROM ledger_entry");
  return r.rows[0].n;
}

/** Runs promises together and sorts outcomes, for race tests. */
export async function race<T>(tasks: (() => Promise<T>)[]) {
  const results = await Promise.allSettled(tasks.map((t) => t()));
  return {
    ok: results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<T>).value),
    failed: results.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason),
  };
}
