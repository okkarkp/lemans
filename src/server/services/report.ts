import "server-only";
import { z } from "zod";
import { pool, withTx, type Db } from "../db";
import { now, type Now } from "../clock";
import { appendLedger } from "../ledger";
import { addDays, monthBounds, workingDaysBetween, type IsoMonth } from "../domain/calendar";
import { buildMonthlyReport, type MonthlyReport } from "../domain/report";
import { conflict, rejected } from "../errors";
import type { CurrentUser } from "../auth/session";
import { listPersonnel } from "./reference";
import { notify, usersWithRole } from "./notify";
import { formatMonth } from "../domain/calendar";
import { loadStatusResolver } from "./status";

export interface Acceptance { acceptedBy: string; acceptedAt: string; ledgerSeq: number }
export interface Invoice { invoiceRef: string; raisedBy: string; raisedAt: string; ledgerSeq: number }
export interface ReportView {
  report: MonthlyReport;
  complete: boolean;
  acceptance: Acceptance | null;
  invoice: Invoice | null;
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
  const inv = (await db.query(
    "SELECT i.invoice_ref, u.display_name, i.raised_at, i.ledger_seq FROM invoice_record i JOIN app_user u ON u.id = i.raised_by WHERE i.report_month = $1", [month])).rows[0];
  const invoice = inv ? { invoiceRef: inv.invoice_ref, raisedBy: inv.display_name, raisedAt: (inv.raised_at as Date).toISOString(), ledgerSeq: Number(inv.ledger_seq) } : null;
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
      report: a.snapshot as MonthlyReport, complete: true, corrections, invoice,
      acceptance: { acceptedBy: a.display_name, acceptedAt: (a.accepted_at as Date).toISOString(), ledgerSeq: Number(a.ledger_seq) },
    };
  }
  return { ...(await compute(db, month, await now(db))), acceptance: null, corrections, invoice: null };
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
    await notify(tx, await usersWithRole(tx, "PMO"), {
      kind: "REPORT_ACCEPTED", title: `${formatMonth(month)} report accepted`,
      body: `IRAS accepted the ${formatMonth(month)} report: ${report.billable} billable day(s). The invoice can now be raised.`, link: `/reports?month=${month}`,
    }, n.instant);
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

export const invoiceInput = z.object({ invoiceRef: z.string().trim().regex(/^[A-Za-z0-9/_.-]{3,40}$/, "Invoice number: 3-40 letters, digits or / _ . -") });

/** Records the invoice raised for an accepted month. Once only; the figures behind it are frozen. */
export async function recordInvoice(user: CurrentUser, month: IsoMonth, input: z.infer<typeof invoiceInput>) {
  return withTx(async (tx) => {
    const n = await now(tx);
    await tx.query("SELECT pg_advisory_xact_lock(72026003)");
    const acc = (await tx.query("SELECT billable_days FROM monthly_report WHERE report_month = $1", [month])).rows[0];
    if (!acc) throw rejected("NOT_ACCEPTED", "An invoice can only be recorded after IRAS accepts the month.");
    if ((await tx.query("SELECT 1 FROM invoice_record WHERE report_month = $1", [month])).rowCount) throw conflict("ALREADY_INVOICED", "An invoice is already recorded for this month.");
    const { seq } = await appendLedger(tx, { actorId: user.id, eventType: "INVOICE_RECORDED", occurredAt: n.instant,
      payload: { month, invoiceRef: input.invoiceRef, billable: Number(acc.billable_days) } });
    await tx.query("INSERT INTO invoice_record (report_month, invoice_ref, raised_by, raised_at, ledger_seq) VALUES ($1, $2, $3, $4, $5)",
      [month, input.invoiceRef, user.id, n.instant, seq]);
    await notify(tx, await usersWithRole(tx, "SUPERVISOR"), {
      kind: "INVOICE_RECORDED", title: `${formatMonth(month)} invoice raised`,
      body: `Invoice ${input.invoiceRef} was raised for ${acc.billable_days} billable day(s) in ${formatMonth(month)}.`, link: `/reports?month=${month}`,
    }, n.instant);
    return { seq };
  });
}

/** Excel workbook: summary, one row per person, and the PMO's corrections. Values are written as text and numbers, never formulas. */
export async function toXlsx(v: ReportView): Promise<Buffer> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "LeMans 2.0";
  wb.created = new Date();
  const r = v.report;
  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 34 }, { width: 50 }];
  const rows: [string, string | number][] = [
    ["Month", formatMonth(r.month)],
    ["Status", v.acceptance ? "Accepted" : v.complete ? "Final draft" : "Month-to-date draft"],
    ["Working days in period", r.workingDays],
    ["Billable days", r.billable],
    ["Capacity (assigned personnel-days)", r.capacity],
    ["Attendance rate", Math.round(r.rate * 10000) / 10000],
    ["Unexplained days", r.gaps],
    ["Accepted by", v.acceptance?.acceptedBy ?? "-"],
    ["Accepted at", v.acceptance?.acceptedAt ?? "-"],
    ["Ledger entry of acceptance", v.acceptance?.ledgerSeq ?? "-"],
    ["Invoice", v.invoice ? `${v.invoice.invoiceRef} (${v.invoice.raisedAt})` : "-"],
  ];
  rows.forEach(([k, val]) => summary.addRow([k, val]));
  summary.getColumn(1).font = { bold: true };
  summary.getCell("B6").numFmt = "0.0%";

  const people = wb.addWorksheet("Personnel");
  people.columns = [
    { header: "Service personnel", key: "name", width: 28 }, { header: "Assigned days", key: "assignedDays", width: 14 },
    { header: "Worked", key: "worked", width: 10 }, { header: "Corrected to worked", key: "correctedWorked", width: 20 },
    { header: "Leave", key: "leave", width: 10 }, { header: "Unexplained", key: "gaps", width: 12 }, { header: "Billable", key: "billable", width: 10 },
  ];
  people.getRow(1).font = { bold: true };
  r.rows.forEach((row) => people.addRow(row));
  people.addRow({ name: "Total", assignedDays: r.capacity, billable: r.billable, gaps: r.gaps }).font = { bold: true };

  const corr = wb.addWorksheet("Corrections");
  corr.columns = [{ header: "Service personnel", key: "personnelName", width: 28 }, { header: "Date", key: "workDate", width: 12 },
    { header: "Recorded as", key: "outcome", width: 14 }, { header: "Reason", key: "reason", width: 60 }];
  corr.getRow(1).font = { bold: true };
  v.corrections.forEach((c) => corr.addRow({ ...c, outcome: c.outcome === "WORKED" ? "Worked" : "Leave" }));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
