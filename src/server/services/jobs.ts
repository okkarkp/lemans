import "server-only";
import type { PoolClient } from "pg";
import { pool, withTx } from "../db";
import { config } from "../config";
import { alertPassed, now, type Now } from "../clock";
import { addDays, formatMonth, isWorkingDay, monthOf } from "../domain/calendar";
import { approversOf, notify, usersWithRole, userOfPersonnel } from "./notify";
import { dispatchEmails } from "./email";
import { holidaySet, listPersonnel } from "./reference";
import { loadStatusResolver } from "./status";
import { getReport } from "./report";

interface Job {
  name: string;
  /** The run key if the job is due now (one run per key), or null. */
  due(n: Now, workingDay: boolean): string | null;
  run(tx: PoolClient, n: Now): Promise<Record<string, unknown>>;
}

const JOBS: Job[] = [
  {
    name: "checkin-reminder",
    due: (n, wd) => (wd && n.time >= config().CHECKIN_REMINDER_TIME && !alertPassed(n) ? n.date : null),
    async run(tx, n) {
      const [team, resolver] = [await listPersonnel(tx, n.date), await loadStatusResolver(tx, n.date, n.date, n)];
      const due = team.filter((p) => resolver.statusOf(p.id, n.date) === "AWAITING");
      for (const p of due) {
        await notify(tx, await userOfPersonnel(tx, p.id), {
          kind: "CHECKIN_REMINDER", title: "Reminder: check in today",
          body: `You have not checked in yet. Please check in before ${config().MISSING_CHECKIN_ALERT_TIME}.`, link: "/me",
        }, n.instant);
      }
      return { reminded: due.length };
    },
  },
  {
    name: "missing-checkin-alert",
    due: (n, wd) => (wd && alertPassed(n) ? n.date : null),
    async run(tx, n) {
      const [team, resolver] = [await listPersonnel(tx, n.date), await loadStatusResolver(tx, n.date, n.date, n)];
      const missing = team.filter((p) => resolver.statusOf(p.id, n.date) === "GAP");
      for (const p of missing) {
        await notify(tx, await userOfPersonnel(tx, p.id), {
          kind: "MISSING_CHECKIN", title: "You have not checked in today",
          body: "No check-in or leave is recorded for you today. Check in now, or contact the PMO.", link: "/me",
        }, n.instant);
      }
      if (missing.length) {
        await notify(tx, await usersWithRole(tx, "PMO"), {
          kind: "MISSING_CHECKIN_SUMMARY", title: `${config().MISSING_CHECKIN_ALERT_TIME} alert: ${missing.length} not checked in`,
          body: `${missing.length} service personnel have no check-in and no leave today.`, link: "/pmo",
        }, n.instant);
      }
      return { missing: missing.length };
    },
  },
  {
    name: "approval-reminder",
    due: (n, wd) => (wd && n.time >= "09:00" ? n.date : null),
    async run(tx, n) {
      const cutoff = new Date(n.instant.getTime() - config().APPROVAL_REMINDER_AFTER_DAYS * 86_400_000);
      const stale = (await tx.query(
        `SELECT p.team_id, count(*)::int AS n FROM leave_request l JOIN personnel p ON p.id = l.personnel_id
         WHERE l.status = 'PENDING' AND l.submitted_at <= $1 GROUP BY p.team_id`, [cutoff])).rows;
      for (const s of stale) {
        await notify(tx, await approversOf(tx, s.team_id, n.date), {
          kind: "APPROVAL_REMINDER", title: `${s.n} leave request(s) waiting for you`,
          body: `${s.n} leave request(s) have been waiting more than ${config().APPROVAL_REMINDER_AFTER_DAYS} days for a decision.`, link: "/supervisor",
        }, n.instant);
      }
      return { teams: stale.length };
    },
  },
  {
    name: "month-end-report",
    due: (n) => monthOf(addDays(`${monthOf(n.date)}-01`, -1)),
    async run(tx, n) {
      const month = monthOf(addDays(`${monthOf(n.date)}-01`, -1));
      if ((await tx.query("SELECT 1 FROM monthly_report WHERE report_month = $1", [month])).rowCount) return { skipped: "accepted" };
      const v = await getReport(month);
      if (v.report.rows.length === 0) return { skipped: "no personnel" };
      const body = v.report.gaps
        ? `The ${formatMonth(month)} report is ready, with ${v.report.gaps} unexplained day(s) for the PMO to resolve before IRAS can accept it.`
        : `The ${formatMonth(month)} report is complete and ready for IRAS acceptance.`;
      const to = [...(await usersWithRole(tx, "PMO")), ...(await usersWithRole(tx, "SUPERVISOR"))];
      await notify(tx, to, { kind: "REPORT_READY", title: `${formatMonth(month)} report ready`, body, link: `/reports?month=${month}` }, n.instant);
      return { gaps: v.report.gaps };
    },
  },
];

/** Runs every job that is due and has not run for its key yet, then sends due email. Safe to call often. */
export async function runDueJobs() {
  const n = await now(pool());
  const workingDay = isWorkingDay(n.date, await holidaySet(pool(), n.date, n.date));
  const ran: { job: string; key: string; result: Record<string, unknown> }[] = [];
  for (const job of JOBS) {
    const key = job.due(n, workingDay);
    if (!key) continue;
    await withTx(async (tx) => {
      // One runner per job at a time; the job_run row makes each key run exactly once, and is
      // written in the same transaction as the job's effects, so a failed run is retried.
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`lemans-job:${job.name}`]);
      if ((await tx.query("SELECT 1 FROM job_run WHERE job = $1 AND run_key = $2", [job.name, key])).rowCount) return;
      const result = await job.run(tx, n);
      await tx.query("INSERT INTO job_run (job, run_key, result) VALUES ($1, $2, $3)", [job.name, key, JSON.stringify(result)]);
      ran.push({ job: job.name, key, result });
    });
  }
  const email = await dispatchEmails();
  return { now: `${n.date}T${n.time}`, ran, email };
}
