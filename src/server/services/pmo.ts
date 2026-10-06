import "server-only";
import { z } from "zod";
import { pool, withTx } from "../db";
import { alertPassed, now } from "../clock";
import { appendLedger } from "../ledger";
import { addDays, isIsoDate, isWorkingDay, monthOf, workingDaysBetween } from "../domain/calendar";
import { buildMonthlyReport } from "../domain/report";
import { notFound, rejected } from "../errors";
import type { CurrentUser } from "../auth/session";
import { listPersonnel } from "./reference";
import { loadStatusResolver } from "./status";
import { approvableTeams } from "./teams";

export const correctionInput = z.object({
  personnelId: z.string().min(1),
  workDate: z.string().refine(isIsoDate, "Invalid date."),
  outcome: z.enum(["LEAVE", "WORKED"]),
  reason: z.string().trim().min(5, "Give a reason of at least 5 characters.").max(500),
});
export const followUpInput = z.object({ personnelId: z.string().min(1) });

/** Today's exceptions, this month's unexplained gaps, and the month-to-date rate. */
export async function pmoDashboard() {
  const db = pool();
  const n = await now(db);
  const month = monthOf(n.date);
  const first = `${month}-01`;
  const [team, resolver, follows] = await Promise.all([
    listPersonnel(db, first, n.date),
    loadStatusResolver(db, first, n.date, n),
    db.query("SELECT personnel_id FROM follow_up WHERE work_date = $1", [n.date]),
  ]);
  const followed = new Set(follows.rows.map((r) => r.personnel_id as string));
  const todayIsWorking = isWorkingDay(n.date, resolver.holidays);
  const missingToday = todayIsWorking && alertPassed(n)
    ? team.filter((p) => resolver.statusOf(p.id, n.date) === "GAP").map((p) => ({ ...p, followedUp: followed.has(p.id) }))
    : [];

  const pastDays = workingDaysBetween(first, addDays(n.date, -1), resolver.holidays);
  const gaps = pastDays.flatMap((d) => team.filter((p) => resolver.statusOf(p.id, d) === "GAP").map((p) => ({ date: d, personnel: p })));

  // Month to date counts today only once the alert time has passed.
  const mtdDays = todayIsWorking && alertPassed(n) ? [...pastDays, n.date] : pastDays;
  const mtd = buildMonthlyReport(month, mtdDays, team, resolver.statusOf);
  return { now: n, alertPassed: alertPassed(n), todayIsWorking, missingToday, gaps, mtd };
}

export async function recordFollowUp(user: CurrentUser, personnelId: string) {
  return withTx(async (tx) => {
    const n = await now(tx);
    const p = await tx.query("SELECT 1 FROM personnel WHERE id = $1", [personnelId]);
    if (!p.rowCount) throw notFound("Service personnel");
    const ins = await tx.query(
      "INSERT INTO follow_up (personnel_id, work_date, recorded_by, recorded_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
      [personnelId, n.date, user.id, n.instant]);
    // Idempotent: a repeated click records nothing new, so the ledger stays one entry per follow-up.
    if (ins.rowCount) {
      await appendLedger(tx, { actorId: user.id, eventType: "FOLLOW_UP", occurredAt: n.instant, payload: { personnelId, workDate: n.date } });
    }
  });
}

/** A gap can only be closed by an explicit, reasoned correction - never by editing attendance. */
export async function recordCorrection(user: CurrentUser, input: z.infer<typeof correctionInput>) {
  return withTx(async (tx) => {
    const n = await now(tx);
    const accepted = await tx.query("SELECT 1 FROM monthly_report WHERE report_month = $1", [monthOf(input.workDate)]);
    if (accepted.rowCount) throw rejected("MONTH_CLOSED", "That month's report has already been accepted.");
    const resolver = await loadStatusResolver(tx, input.workDate, input.workDate, n);
    if (resolver.statusOf(input.personnelId, input.workDate) !== "GAP") {
      throw rejected("NOT_A_GAP", "Only an unexplained gap can be corrected.");
    }
    await tx.query(
      `INSERT INTO day_correction (personnel_id, work_date, outcome, reason, recorded_by, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [input.personnelId, input.workDate, input.outcome, input.reason, user.id, n.instant]);
    await appendLedger(tx, { actorId: user.id, eventType: "DAY_CORRECTED", occurredAt: n.instant, payload: { ...input } });
  });
}

/** Today's status per person. A supervisor sees the teams they may approve; the PMO sees everyone. */
export async function liveTeamView(user: CurrentUser) {
  const db = pool();
  const n = await now(db);
  const [all, resolver] = await Promise.all([listPersonnel(db, n.date), loadStatusResolver(db, n.date, n.date, n)]);
  const scope = user.role === "SUPERVISOR" ? await approvableTeams(db, user, n.date) : null;
  const team = scope ? all.filter((p) => scope.has(p.teamId)) : all;
  return {
    now: n,
    rows: team.map((p) => ({ ...p, status: resolver.statusOf(p.id, n.date), attendance: resolver.attendanceOf(p.id, n.date) })),
  };
}
