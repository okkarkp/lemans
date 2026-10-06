import "server-only";
import { pool, withTx, type Db } from "../db";
import { now, type Now } from "../clock";
import { appendLedger } from "../ledger";
import { addDays, monthBounds, workingDaysBetween, type IsoMonth } from "../domain/calendar";
import { buildMonthlyReport, type MonthlyReport } from "../domain/report";
import { conflict, rejected } from "../errors";
import type { CurrentUser } from "../auth/session";
import { listPersonnel } from "./reference";
import { loadStatusResolver } from "./status";

export interface Acceptance { acceptedBy: string; acceptedAt: string; ledgerSeq: number }
export interface ReportView {
  report: MonthlyReport;
  complete: boolean;
  acceptance: Acceptance | null;
  corrections: { personnelName: string; workDate: string; outcome: string; reason: string }[];
}

/** Completed days only: a day counts once it is over. A month is complete the day after it ends. */
async function compute(db: Db, month: IsoMonth, n: Now): Promise<{ report: MonthlyReport; complete: boolean }> {
  const { first, last } = monthBounds(month);
  const complete = n.date > last;
  const cutoff = complete ? last : addDays(n.date, -1);
  if (cutoff < first) return { report: buildMonthlyReport(month, [], [], () => "AWAITING"), complete };
  const team = await listPersonnel(db, first, cutoff);
  const resolver = await loadStatusResolver(db, first, cutoff, n);
  const days = workingDaysBetween(first, cutoff, resolver.holidays);
  return { report: buildMonthlyReport(month, days, team, resolver.statusOf), complete };
}

export async function getReport(month: IsoMonth): Promise<ReportView> {
  const db = pool();
  const [acc, corr] = await Promise.all([
    db.query(
      `SELECT m.snapshot, m.accepted_at, m.ledger_seq, u.display_name FROM monthly_report m
       JOIN app_user u ON u.id = m.accepted_by WHERE m.report_month = $1`, [month]),
    db.query(
      `SELECT p.display_name, c.work_date, c.outcome, c.reason FROM day_correction c JOIN personnel p ON p.id = c.personnel_id
       WHERE to_char(c.work_date, 'YYYY-MM') = $1 ORDER BY c.work_date`, [month]),
  ]);
  const corrections = corr.rows.map((r) => ({ personnelName: r.display_name, workDate: r.work_date, outcome: r.outcome, reason: r.reason }));
  const a = acc.rows[0];
  // Once accepted, the report is the frozen snapshot - later data cannot change an agreed number.
  if (a) {
    return {
      report: a.snapshot as MonthlyReport, complete: true, corrections,
      acceptance: { acceptedBy: a.display_name, acceptedAt: (a.accepted_at as Date).toISOString(), ledgerSeq: Number(a.ledger_seq) },
    };
  }
  return { ...(await compute(db, month, await now(db))), acceptance: null, corrections };
}

export async function acceptReport(user: CurrentUser, month: IsoMonth) {
  return withTx(async (tx) => {
    const n = await now(tx);
    await tx.query("SELECT pg_advisory_xact_lock(72026003)");
    const existing = await tx.query("SELECT 1 FROM monthly_report WHERE report_month = $1", [month]);
    if (existing.rowCount) throw conflict("ALREADY_ACCEPTED", "This report has already been accepted.");
    const { report, complete } = await compute(tx, month, n);
    if (!complete) throw rejected("MONTH_OPEN", "The month is not over yet.");
    if (report.gaps > 0) throw rejected("GAPS_OPEN", `${report.gaps} day(s) are still unexplained.`);
    const { seq } = await appendLedger(tx, {
      actorId: user.id, eventType: "REPORT_ACCEPTED", occurredAt: n.instant,
      payload: { month, billable: report.billable, capacity: report.capacity, rate: Math.round(report.rate * 10000) / 10000 },
    });
    await tx.query(
      `INSERT INTO monthly_report (report_month, billable_days, capacity_days, snapshot, accepted_by, accepted_at, ledger_seq)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [month, report.billable, report.capacity, JSON.stringify(report), user.id, n.instant, seq]);
    return { seq };
  });
}

/** CSV with formula-injection protection: cells starting with = + - @ are prefixed with a quote. */
export function toCsv(v: ReportView): string {
  const cell = (x: string | number) => {
    let s = String(x);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    ["Service personnel", "Worked", "Corrected to worked", "Leave", "Gaps", "Billable"],
    ...v.report.rows.map((r) => [r.name, r.worked, r.correctedWorked, r.leave, r.gaps, r.billable]),
    ["Total", "", "", "", v.report.gaps, v.report.billable],
    ["Capacity (personnel x working days)", "", "", "", "", v.report.capacity],
    ["Attendance rate", "", "", "", "", `${(v.report.rate * 100).toFixed(1)}%`],
    ["Status", v.acceptance ? `Accepted by ${v.acceptance.acceptedBy} at ${v.acceptance.acceptedAt} (ledger #${v.acceptance.ledgerSeq})` : "Draft - not accepted"],
  ];
  return lines.map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n";
}
