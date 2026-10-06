import "server-only";
import type { Db } from "../db";
import { alertPassed, type Now } from "../clock";
import { isWorkingDay, type IsoDate } from "../domain/calendar";
import { resolveDayStatus, type DayStatus } from "../domain/day-status";
import { holidaySet, isAssigned, listPersonnel } from "./reference";

export interface AttendanceRecord {
  location: "OFFICE" | "WFH";
  strength: "STRONG" | "MEDIUM";
  device: string;
  network: string;
  checkedInAt: string;
}

/** Loads every fact for a date range in four queries, then resolves day status in memory (no N+1). */
export async function loadStatusResolver(db: Db, from: IsoDate, to: IsoDate, n: Now) {
  // Sequential on purpose: `db` may be a transaction client, which must not run queries concurrently.
  const holidays = await holidaySet(db, from, to);
  const periods = new Map((await listPersonnel(db, from, to)).map((p) => [p.id, p]));
  const att = await db.query(
    `SELECT personnel_id, work_date, location, evidence_strength, evidence_device, evidence_network, checked_in_at
     FROM attendance WHERE work_date BETWEEN $1 AND $2`, [from, to]);
  const leave = await db.query(
    `SELECT personnel_id, start_date, end_date FROM leave_request
     WHERE status = 'APPROVED' AND start_date <= $2 AND end_date >= $1`, [from, to]);
  const corr = await db.query(`SELECT personnel_id, work_date, outcome FROM day_correction WHERE work_date BETWEEN $1 AND $2`, [from, to]);
  const key = (p: string, d: IsoDate) => `${p}|${d}`;
  const attendance = new Map<string, AttendanceRecord>(att.rows.map((r) => [key(r.personnel_id, r.work_date), {
    location: r.location, strength: r.evidence_strength, device: r.evidence_device, network: r.evidence_network,
    checkedInAt: (r.checked_in_at as Date).toISOString(),
  }]));
  const corrections = new Map<string, "LEAVE" | "WORKED">(corr.rows.map((r) => [key(r.personnel_id, r.work_date), r.outcome]));
  const onLeave = (p: string, d: IsoDate) => leave.rows.some((l) => l.personnel_id === p && l.start_date <= d && d <= l.end_date);
  const ctxAlert = alertPassed(n);

  return {
    holidays,
    attendanceOf: (p: string, d: IsoDate) => attendance.get(key(p, d)) ?? null,
    correctionOf: (p: string, d: IsoDate) => corrections.get(key(p, d)) ?? null,
    statusOf: (p: string, d: IsoDate): DayStatus => resolveDayStatus(
      d,
      { attended: attendance.has(key(p, d)), onApprovedLeave: onLeave(p, d), correction: corrections.get(key(p, d)) ?? null },
      {
        today: n.date, alertPassed: ctxAlert, workingDay: isWorkingDay(d, holidays),
        assigned: periods.has(p) && isAssigned(periods.get(p)!, d),
      },
    ),
  };
}
