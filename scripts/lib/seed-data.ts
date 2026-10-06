/**
 * Demo data: August 2026 complete and accepted; September 2026 in progress, with the demo clock
 * at 22 September 12:30. All people are fictional placeholders.
 */
import { types, type ClientBase } from "pg";
import { appendLedger } from "../../src/server/ledger";
import { addDays, isWorkingDay, workingDaysBetween } from "../../src/server/domain/calendar";
import { buildMonthlyReport } from "../../src/server/domain/report";
import type { DayStatus } from "../../src/server/domain/day-status";

types.setTypeParser(1082, (v) => v);

const PERSONNEL = [
  ["SP01", "Personnel 01", "Developer"], ["SP02", "Personnel 02", "Developer"], ["SP03", "Personnel 03", "Test analyst"],
  ["SP04", "Personnel 04", "Business analyst"], ["SP05", "Personnel 05", "Support engineer"], ["SP06", "Personnel 06", "Support engineer"],
] as const;
const SUPERVISOR = "u-sup01";
const PMO = "u-pmo01";
const STAFF = [
  [SUPERVISOR, "IRAS Supervisor (demo)", "SUPERVISOR"], ["u-sup02", "IRAS Supervisor 2 (demo)", "SUPERVISOR"],
  [PMO, "Accenture PMO (demo)", "PMO"],
  ["u-admin01", "System Administrator (demo)", "ADMIN"], ["u-admin02", "System Administrator 2 (demo)", "ADMIN"],
] as const;
const TEAMS = [["APP", "Application development", SUPERVISOR], ["OPS", "Operations support", "u-sup02"]] as const;
const TEAM_OF: Record<string, string> = { SP01: "APP", SP02: "APP", SP05: "APP", SP03: "OPS", SP04: "OPS", SP06: "OPS" };
const user = (pid: string) => `u-${pid.toLowerCase()}`;
const HOLIDAYS: [string, string][] = [["2026-08-10", "National Day (observed)"]];
const holidaySet = new Set(HOLIDAYS.map(([d]) => d));
const DEMO_NOW = "2026-09-22T12:30";
const TODAY = DEMO_NOW.slice(0, 10);

const at = (date: string, time: string) => new Date(`${date}T${time}:00+08:00`);
type Leave = { pid: string; from: string; to: string; type: string; backup: string; status: "APPROVED" | "PENDING" };
const LEAVE: Leave[] = [
  { pid: "SP01", from: "2026-08-17", to: "2026-08-18", type: "ANNUAL", backup: "SP02", status: "APPROVED" },
  { pid: "SP06", from: "2026-08-24", to: "2026-08-24", type: "MEDICAL", backup: "SP05", status: "APPROVED" },
  { pid: "SP03", from: "2026-09-03", to: "2026-09-03", type: "ANNUAL", backup: "SP01", status: "APPROVED" },
  { pid: "SP05", from: "2026-09-08", to: "2026-09-08", type: "MEDICAL", backup: "SP06", status: "APPROVED" },
  { pid: "SP02", from: "2026-09-10", to: "2026-09-11", type: "ANNUAL", backup: "SP01", status: "APPROVED" },
  { pid: "SP04", from: "2026-09-16", to: "2026-09-18", type: "ANNUAL", backup: "SP03", status: "APPROVED" },
  { pid: "SP03", from: "2026-09-24", to: "2026-09-25", type: "ANNUAL", backup: "SP04", status: "APPROVED" },
  { pid: "SP05", from: "2026-09-29", to: "2026-09-30", type: "CHILDCARE", backup: "SP06", status: "PENDING" },
];
const CORRECTIONS = [{ pid: "SP02", date: "2026-08-20", outcome: "WORKED", reason: "On site all day; confirmed by IRAS supervisor after a sign-in outage.", recordedOn: "2026-08-21" }];
const GAPS = new Set(["SP06|2026-09-15", "SP02|2026-08-20"]);
const NOT_YET_TODAY = new Set(["SP03", "SP06"]);

const onLeave = (pid: string, d: string) => LEAVE.some((l) => l.status === "APPROVED" && l.pid === pid && l.from <= d && d <= l.to);

export const SEED_DEMO_NOW = DEMO_NOW;

/** Replaces all data with the demo scenario, in one transaction. */
export async function seedDatabase(db: ClientBase): Promise<{ events: number }> {
  try {
    await db.query("BEGIN");
    // Every application table, so tables added by later migrations are never missed.
    const tables = (await db.query(
      "SELECT string_agg(format('%I', tablename), ', ') AS l FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'",
    )).rows[0].l;
    await db.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
    for (const [id, name, role] of STAFF) await db.query("INSERT INTO app_user (id, display_name, role) VALUES ($1, $2, $3)", [id, name, role]);
    for (const [id, name, sup] of TEAMS) await db.query("INSERT INTO team (id, name, supervisor_id) VALUES ($1, $2, $3)", [id, name, sup]);
    for (const [id, name, role] of PERSONNEL) {
      await db.query("INSERT INTO personnel (id, display_name, role_title, start_date, team_id) VALUES ($1, $2, $3, '2026-01-05', $4)",
        [id, name, role, TEAM_OF[id]]);
      await db.query("INSERT INTO app_user (id, display_name, role, personnel_id) VALUES ($1, $2, 'PERSONNEL', $3)", [user(id), name, id]);
    }
    for (const [d, n] of HOLIDAYS) await db.query("INSERT INTO public_holiday (holiday_date, name) VALUES ($1, $2)", [d, n]);
    await db.query("INSERT INTO app_setting (key, value) VALUES ('demo_now', $1)", [DEMO_NOW]);

    // Build every event, then write them in time order so the ledger reads like real history.
    type Ev = { when: Date; run: () => Promise<void> };
    const events: Ev[] = [];

    for (const l of LEAVE) {
      const submitted = at(addDays(l.from, l.status === "PENDING" ? -8 : -7), "10:15");
      let id = 0;
      events.push({ when: submitted, run: async () => {
        const r = await db.query(
          `INSERT INTO leave_request (personnel_id, leave_type, start_date, end_date, backup_personnel_id, submitted_at, days)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [l.pid, l.type, l.from, l.to, l.backup, submitted, workingDaysBetween(l.from, l.to, holidaySet).length]);
        id = Number(r.rows[0].id);
        await appendLedger(db, { actorId: user(l.pid), eventType: "LEAVE_REQUESTED", occurredAt: submitted,
          payload: { requestId: id, personnelId: l.pid, leaveType: l.type, startDate: l.from, endDate: l.to, backupPersonnelId: l.backup } });
      } });
      if (l.status === "APPROVED") {
        const decided = at(addDays(l.from, -6), "14:40");
        events.push({ when: decided, run: async () => {
          await db.query("UPDATE leave_request SET status = 'APPROVED', decided_at = $2, decided_by = $3 WHERE id = $1", [id, decided, SUPERVISOR]);
          await appendLedger(db, { actorId: SUPERVISOR, eventType: "LEAVE_APPROVED", occurredAt: decided, payload: { requestId: id, personnelId: l.pid, note: null } });
        } });
      }
    }

    PERSONNEL.forEach(([pid], i) => {
      for (const d of workingDaysBetween("2026-08-01", TODAY, holidaySet)) {
        if (onLeave(pid, d) || GAPS.has(`${pid}|${d}`) || (d === TODAY && NOT_YET_TODAY.has(pid))) continue;
        const wfh = (Number(d.slice(8)) + i) % 3 === 0;
        const phone = !wfh && (Number(d.slice(8)) + i) % 4 === 0;
        const when = at(d, `0${8 + (i % 2)}:${String(35 + i * 4).padStart(2, "0")}`);
        const ev = {
          location: wfh ? "WFH" : "OFFICE", strength: phone ? "MEDIUM" : "STRONG",
          device: phone ? "Personal phone (unmanaged, simulated)" : "WOG laptop (managed, simulated)",
          network: wfh ? "Remote network (simulated)" : "IRAS office network (simulated)",
        };
        events.push({ when, run: async () => {
          await db.query(
            `INSERT INTO attendance (personnel_id, work_date, location, evidence_device, evidence_network, evidence_strength, checked_in_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`, [pid, d, ev.location, ev.device, ev.network, ev.strength, when]);
          await appendLedger(db, { actorId: user(pid), eventType: "CHECK_IN", occurredAt: when,
            payload: { personnelId: pid, workDate: d, ...ev } });
        } });
      }
    });

    // One rejected attempt, to show that refusals are evidence too.
    const rej = at("2026-09-14", "09:02");
    events.push({ when: rej, run: async () => {
      await appendLedger(db, { actorId: user("SP06"), eventType: "CHECK_IN_REJECTED", occurredAt: rej,
        payload: { personnelId: "SP06", workDate: "2026-09-14", declared: "WFH", code: "UNMANAGED_DEVICE_REMOTE",
          device: "Personal phone (unmanaged, simulated)", network: "Remote network (simulated)" } });
    } });

    for (const c of CORRECTIONS) {
      const when = at(c.recordedOn, "11:05");
      events.push({ when, run: async () => {
        await db.query(`INSERT INTO day_correction (personnel_id, work_date, outcome, reason, recorded_by, recorded_at) VALUES ($1, $2, $3, $4, $5, $6)`,
          [c.pid, c.date, c.outcome, c.reason, PMO, when]);
        await appendLedger(db, { actorId: PMO, eventType: "DAY_CORRECTED", occurredAt: when,
          payload: { personnelId: c.pid, workDate: c.date, outcome: c.outcome, reason: c.reason } });
      } });
    }

    // August accepted on 3 September.
    const accepted = at("2026-09-03", "10:20");
    events.push({ when: accepted, run: async () => {
      const days = workingDaysBetween("2026-08-01", "2026-08-31", holidaySet);
      const status = (pid: string, d: string): DayStatus =>
        onLeave(pid, d) ? "LEAVE" : CORRECTIONS.some((c) => c.pid === pid && c.date === d) ? "CORRECTED_WORKED" : "WORKED";
      const report = buildMonthlyReport("2026-08", days, PERSONNEL.map(([id, name]) => ({ id, name })), status);
      const { seq } = await appendLedger(db, { actorId: SUPERVISOR, eventType: "REPORT_ACCEPTED", occurredAt: accepted,
        payload: { month: "2026-08", billable: report.billable, capacity: report.capacity, rate: Math.round(report.rate * 10000) / 10000 } });
      await db.query(`INSERT INTO monthly_report (report_month, billable_days, capacity_days, snapshot, accepted_by, accepted_at, ledger_seq)
        VALUES ('2026-08', $1, $2, $3, $4, $5, $6)`, [report.billable, report.capacity, JSON.stringify(report), SUPERVISOR, accepted, seq]);
    } });

    events.sort((a, b) => a.when.getTime() - b.when.getTime());
    for (const e of events) await e.run();
    await db.query("COMMIT");
    if (!isWorkingDay(TODAY, holidaySet)) throw new Error("Demo date is not a working day.");
    return { events: events.length };
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
}
