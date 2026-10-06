import "server-only";
import { z } from "zod";
import { pool, withTx, type Db } from "../db";
import { config } from "../config";
import { now } from "../clock";
import { appendLedger } from "../ledger";
import { addDays, isIsoDate, workingDaysBetween, type IsoDate } from "../domain/calendar";
import { computeCoverage, type CoverageResult } from "../domain/coverage";
import { badRequest, conflict, forbidden, notFound, rejected } from "../errors";
import type { CurrentUser } from "../auth/session";
import { isBalanced } from "../domain/leave-balance";
import { balanceFor } from "./entitlements";
import { holidaySet, isAssigned, listPersonnel } from "./reference";
import { approvableTeams } from "./teams";

export const LEAVE_TYPES = { ANNUAL: "Annual leave", MEDICAL: "Medical leave", CHILDCARE: "Childcare leave", OTHER: "Other leave" } as const;
const MAX_SPAN_DAYS = 30;

const isoDate = z.string().refine(isIsoDate, "Dates must be valid (YYYY-MM-DD).");
export const leaveInput = z.object({
  leaveType: z.enum(["ANNUAL", "MEDICAL", "CHILDCARE", "OTHER"]),
  startDate: isoDate,
  endDate: isoDate,
  backupPersonnelId: z.string().min(1, "Choose a backup."),
  halfDay: z.enum(["AM", "PM"]).optional(),
}).refine((v) => v.endDate >= v.startDate, "End date must be on or after the start date.")
  .refine((v) => !v.halfDay || v.startDate === v.endDate, "A half day must be a single day.");

export const decisionInput = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(500).optional(),
}).refine((v) => v.decision === "APPROVE" || (v.note?.length ?? 0) >= 5, "Give a reason of at least 5 characters when rejecting.");

export interface CoverageCheck extends CoverageResult { floor: number; passes: boolean; workingDays: number }

/** Coverage if this person were also away. Pending requests count as away: they may yet be approved. */
export async function coverageFor(db: Db, personnelId: string, start: IsoDate, end: IsoDate, excludeRequestId?: number): Promise<CoverageCheck> {
  // Sequential: `db` may be a transaction client.
  const team = await listPersonnel(db, start, end);
  const holidays = await holidaySet(db, start, end);
  const away = await db.query(
    `SELECT personnel_id, start_date, end_date FROM leave_request
     WHERE status IN ('APPROVED', 'PENDING') AND start_date <= $2 AND end_date >= $1 AND ($3::bigint IS NULL OR id <> $3)`,
    [start, end, excludeRequestId ?? null]);
  const days = workingDaysBetween(start, end, holidays);
  const result = computeCoverage(days, (day) => team.filter((p) => isAssigned(p, day)).length, (day) => {
    const s = new Set<string>([personnelId]);
    for (const l of away.rows) if (l.start_date <= day && day <= l.end_date) s.add(l.personnel_id);
    return s;
  });
  const floor = config().COVERAGE_FLOOR;
  return { ...result, floor, passes: result.minRatio >= floor, workingDays: days.length };
}

export async function submitLeave(user: CurrentUser, input: z.infer<typeof leaveInput>) {
  const personnelId = user.personnelId;
  if (!personnelId) throw rejected("NOT_PERSONNEL", "Only service personnel can apply for leave.");
  if (input.backupPersonnelId === personnelId) throw badRequest("BACKUP_SELF", "Your backup must be someone else.");

  return withTx(async (tx) => {
    const n = await now(tx);
    if (input.startDate < n.date) throw rejected("BACKDATED", "Leave cannot start in the past. Ask the PMO to record a correction instead.");
    if (input.endDate > addDays(input.startDate, MAX_SPAN_DAYS - 1)) throw rejected("TOO_LONG", `A single request can cover at most ${MAX_SPAN_DAYS} days.`);
    if (input.startDate.slice(0, 4) !== input.endDate.slice(0, 4)) throw rejected("SPANS_YEARS", "Split leave at the year end: entitlements are per calendar year.");

    // Serialise leave submissions so two concurrent requests cannot both pass the coverage check.
    await tx.query("SELECT pg_advisory_xact_lock(72026002)");

    const assigned = await listPersonnel(tx, input.startDate, input.endDate);
    const me = assigned.find((p) => p.id === personnelId);
    if (!me || !isAssigned(me, input.startDate) || !isAssigned(me, input.endDate)) {
      throw rejected("OUTSIDE_ASSIGNMENT", "The leave falls outside your assignment period.");
    }
    const backup = assigned.find((p) => p.id === input.backupPersonnelId);
    if (!backup || !isAssigned(backup, input.startDate) || !isAssigned(backup, input.endDate)) {
      throw badRequest("BACKUP_UNKNOWN", "The chosen backup is not on the team for the whole period.");
    }
    const overlap = await tx.query(
      `SELECT personnel_id FROM leave_request WHERE personnel_id = ANY($1) AND status IN ('APPROVED', 'PENDING')
       AND start_date <= $3 AND end_date >= $2`,
      [[personnelId, input.backupPersonnelId], input.startDate, input.endDate]);
    if (overlap.rows.some((r) => r.personnel_id === personnelId)) throw conflict("OVERLAP", "You already have leave in this period.");
    if (overlap.rows.length) throw rejected("BACKUP_AWAY", "Your backup is also away during this period.");

    const cov = await coverageFor(tx, personnelId, input.startDate, input.endDate);
    if (cov.workingDays === 0) throw rejected("NO_WORKING_DAYS", "The period has no working days.");
    const days = input.halfDay ? 0.5 : cov.workingDays;
    if (isBalanced(input.leaveType)) {
      const bal = await balanceFor(tx, personnelId, Number(input.startDate.slice(0, 4)), input.leaveType);
      if (days > bal.remaining) throw rejected("INSUFFICIENT_BALANCE", `This needs ${days} day(s) but only ${bal.remaining} remain for ${LEAVE_TYPES[input.leaveType].toLowerCase()} this year.`);
    }
    if (!cov.passes) throw rejected("SLA_COVERAGE", `Coverage would fall to ${pct(cov.minRatio)} on ${cov.worstDay}, below the ${pct(cov.floor)} floor.`);

    const ins = await tx.query<{ id: string }>(
      `INSERT INTO leave_request (personnel_id, leave_type, start_date, end_date, backup_personnel_id, submitted_at, half_day, days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [personnelId, input.leaveType, input.startDate, input.endDate, input.backupPersonnelId, n.instant, input.halfDay ?? null, days]);
    const id = Number(ins.rows[0].id);
    await appendLedger(tx, {
      actorId: user.id, eventType: "LEAVE_REQUESTED", occurredAt: n.instant,
      payload: { requestId: id, personnelId, ...input, days, coverage: round(cov.minRatio) },
    });
    return { id };
  });
}

export async function decideLeave(user: CurrentUser, requestId: number, input: z.infer<typeof decisionInput>) {
  return withTx(async (tx) => {
    const n = await now(tx);
    await tx.query("SELECT pg_advisory_xact_lock(72026002)");
    const r = await tx.query(
      "SELECT l.*, p.team_id FROM leave_request l JOIN personnel p ON p.id = l.personnel_id WHERE l.id = $1 FOR UPDATE OF l", [requestId]);
    const req = r.rows[0];
    if (!req) throw notFound("Leave request");
    // Object-level check: being a supervisor is not enough; it must be a team this user may approve today.
    if (!(await approvableTeams(tx, user, n.date)).has(req.team_id)) throw forbidden();
    if (req.status !== "PENDING") throw conflict("ALREADY_DECIDED", `This request is already ${req.status.toLowerCase()}.`);

    if (input.decision === "APPROVE") {
      if (req.leave_type === "MEDICAL") {
        const mc = await tx.query("SELECT 1 FROM leave_attachment WHERE leave_request_id = $1", [requestId]);
        if (!mc.rowCount) throw rejected("MC_REQUIRED", "Medical leave needs a medical certificate before it can be approved.");
      }
      const cov = await coverageFor(tx, req.personnel_id, req.start_date, req.end_date, requestId);
      if (!cov.passes) throw rejected("SLA_COVERAGE", `Approving would drop coverage to ${pct(cov.minRatio)} on ${cov.worstDay}.`);
    }
    const status = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    await tx.query(
      "UPDATE leave_request SET status = $2, decided_at = $3, decided_by = $4, decision_note = $5 WHERE id = $1",
      [requestId, status, n.instant, user.id, input.note ?? null]);
    await appendLedger(tx, {
      actorId: user.id, eventType: status === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_REJECTED", occurredAt: n.instant,
      payload: { requestId, personnelId: req.personnel_id, note: input.note ?? null },
    });
    return { status };
  });
}

/** The requester takes back a request that has not been decided yet. */
export async function withdrawLeave(user: CurrentUser, requestId: number) {
  return changeOwnLeave(user, requestId, "PENDING", "WITHDRAWN", "LEAVE_WITHDRAWN");
}

/** The requester cancels approved leave that has not started; the days return to the balance. */
export async function cancelLeave(user: CurrentUser, requestId: number) {
  return changeOwnLeave(user, requestId, "APPROVED", "CANCELLED", "LEAVE_CANCELLED");
}

async function changeOwnLeave(user: CurrentUser, requestId: number, from: string, to: string, event: "LEAVE_WITHDRAWN" | "LEAVE_CANCELLED") {
  return withTx(async (tx) => {
    const n = await now(tx);
    const req = (await tx.query("SELECT * FROM leave_request WHERE id = $1 FOR UPDATE", [requestId])).rows[0];
    // Someone else's request is reported as not found, so ids cannot be probed.
    if (!req || req.personnel_id !== user.personnelId) throw notFound("Leave request");
    if (req.status !== from) throw conflict("WRONG_STATUS", `Only ${from.toLowerCase()} requests can be ${to.toLowerCase()}. This one is ${req.status.toLowerCase()}.`);
    if (to === "CANCELLED" && req.start_date <= n.date) throw rejected("ALREADY_STARTED", "Leave that has started cannot be cancelled. Ask the PMO to record a correction.");
    await tx.query("UPDATE leave_request SET status = $2, cancelled_at = $3 WHERE id = $1", [requestId, to, n.instant]);
    await appendLedger(tx, { actorId: user.id, eventType: event, occurredAt: n.instant, payload: { requestId, personnelId: req.personnel_id } });
    return { status: to };
  });
}

export interface LeaveView {
  id: number; personnelId: string; personnelName: string; leaveType: string; leaveTypeCode: string; startDate: IsoDate; endDate: IsoDate;
  backupName: string; status: string; submittedAt: string; decisionNote: string | null; teamName: string;
  halfDay: "AM" | "PM" | null; days: number; attachments: number;
}
const LEAVE_SELECT = `
  SELECT l.id, l.personnel_id, p.display_name AS personnel_name, l.leave_type, l.start_date, l.end_date,
         b.display_name AS backup_name, l.status, l.submitted_at, l.decision_note, t.name AS team_name, l.half_day, l.days,
         (SELECT count(*)::int FROM leave_attachment a WHERE a.leave_request_id = l.id) AS attachments
  FROM leave_request l JOIN personnel p ON p.id = l.personnel_id JOIN personnel b ON b.id = l.backup_personnel_id
  JOIN team t ON t.id = p.team_id`;
const mapLeave = (r: Record<string, unknown>): LeaveView => ({
  id: Number(r.id), personnelId: r.personnel_id as string, personnelName: r.personnel_name as string,
  leaveType: LEAVE_TYPES[r.leave_type as keyof typeof LEAVE_TYPES], startDate: r.start_date as string, endDate: r.end_date as string,
  backupName: r.backup_name as string, status: r.status as string, submittedAt: (r.submitted_at as Date).toISOString(),
  decisionNote: (r.decision_note as string | null) ?? null, teamName: r.team_name as string,
  leaveTypeCode: r.leave_type as string, halfDay: (r.half_day as "AM" | "PM" | null) ?? null, days: Number(r.days), attachments: Number(r.attachments),
});

/** Pending requests this supervisor may decide today (own teams and delegated ones). */
export async function listPending(user: CurrentUser): Promise<(LeaveView & { coverage: CoverageCheck })[]> {
  const db = pool();
  const teams = [...(await approvableTeams(db, user, (await now(db)).date))];
  const r = await db.query(`${LEAVE_SELECT} WHERE l.status = 'PENDING' AND p.team_id = ANY($1) ORDER BY l.start_date LIMIT 100`, [teams]);
  return Promise.all(r.rows.map(async (row) => {
    const v = mapLeave(row);
    return { ...v, coverage: await coverageFor(db, v.personnelId, v.startDate, v.endDate, v.id) };
  }));
}

export async function listMine(personnelId: string, limit = 10): Promise<LeaveView[]> {
  const r = await pool().query(`${LEAVE_SELECT} WHERE l.personnel_id = $1 ORDER BY l.start_date DESC LIMIT $2`, [personnelId, limit]);
  return r.rows.map(mapLeave);
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const round = (x: number) => Math.round(x * 1000) / 1000;
