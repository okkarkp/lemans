import "server-only";
import { pool, withTx } from "../db";
import { now } from "../clock";
import { appendLedger } from "../ledger";
import { addDays, isWorkingDay } from "../domain/calendar";
import { evaluateCheckIn, type Location, type TrustSignals } from "../domain/checkin-policy";
import { conflict, rejected } from "../errors";
import type { CurrentUser } from "../auth/session";
import { holidaySet } from "./reference";
import { loadStatusResolver } from "./status";

export type CheckInOutcome =
  | { accepted: true; location: Location; strength: "STRONG" | "MEDIUM"; checkedInAt: string }
  | { accepted: false; code: string; message: string };

/**
 * Records a check-in. A policy rejection is itself evidence, so it is written to the ledger
 * (and committed) rather than thrown away.
 */
export async function checkIn(user: CurrentUser, declared: Location, signals: TrustSignals): Promise<CheckInOutcome> {
  const personnelId = user.personnelId;
  if (!personnelId) throw rejected("NOT_PERSONNEL", "Only service personnel can check in.");

  return withTx(async (tx) => {
    const n = await now(tx);
    if (!isWorkingDay(n.date, await holidaySet(tx, n.date, n.date))) {
      throw rejected("NOT_WORKING_DAY", "Today is not a working day.");
    }
    const period = await tx.query(
      "SELECT 1 FROM personnel WHERE id = $1 AND start_date <= $2 AND (end_date IS NULL OR end_date >= $2)", [personnelId, n.date]);
    if (!period.rowCount) throw rejected("NOT_ASSIGNED", "You are not assigned to the contract today.");
    const leave = await tx.query(
      "SELECT 1 FROM leave_request WHERE personnel_id = $1 AND status = 'APPROVED' AND $2 BETWEEN start_date AND end_date",
      [personnelId, n.date]);
    if (leave.rowCount) throw rejected("ON_LEAVE", "You are on approved leave today.");
    const existing = await tx.query("SELECT 1 FROM attendance WHERE personnel_id = $1 AND work_date = $2", [personnelId, n.date]);
    if (existing.rowCount) throw conflict("ALREADY_CHECKED_IN", "You have already checked in today.");

    const evidence = { device: signals.deviceLabel, network: signals.networkLabel };
    const decision = evaluateCheckIn(declared, signals);
    if (!decision.accepted) {
      await appendLedger(tx, {
        actorId: user.id, eventType: "CHECK_IN_REJECTED", occurredAt: n.instant,
        payload: { personnelId, workDate: n.date, declared, code: decision.code, ...evidence },
      });
      return { accepted: false, code: decision.code, message: decision.message };
    }
    await tx.query(
      `INSERT INTO attendance (personnel_id, work_date, location, evidence_device, evidence_network, evidence_strength, checked_in_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [personnelId, n.date, decision.location, evidence.device, evidence.network, decision.strength, n.instant]);
    await appendLedger(tx, {
      actorId: user.id, eventType: "CHECK_IN", occurredAt: n.instant,
      payload: { personnelId, workDate: n.date, location: decision.location, strength: decision.strength, ...evidence },
    });
    return { accepted: true, location: decision.location, strength: decision.strength, checkedInAt: n.instant.toISOString() };
  });
}

export async function myDay(personnelId: string) {
  const db = pool();
  const n = await now(db);
  const resolver = await loadStatusResolver(db, n.date, n.date, n);
  return { now: n, status: resolver.statusOf(personnelId, n.date), attendance: resolver.attendanceOf(personnelId, n.date) };
}

export async function myMonth(personnelId: string) {
  const db = pool();
  const n = await now(db);
  const first = `${n.date.slice(0, 7)}-01`;
  const resolver = await loadStatusResolver(db, first, n.date, n);
  const days: { date: string; status: string }[] = [];
  for (let d = first; d <= n.date; d = addDays(d, 1)) days.push({ date: d, status: resolver.statusOf(personnelId, d) });
  return days;
}
