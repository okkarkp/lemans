import "server-only";
import { z } from "zod";
import { pool, withTx } from "../db";
import { now } from "../clock";
import { appendLedger } from "../ledger";
import { isIsoDate, monthBounds, type IsoDate } from "../domain/calendar";
import { conflict, notFound, rejected } from "../errors";
import type { CurrentUser } from "../auth/session";

export const holidayInput = z.object({
  date: z.string().refine(isIsoDate, "Enter a valid date."),
  name: z.string().trim().min(2).max(80),
});

export async function listHolidays(year: number) {
  const r = await pool().query(
    "SELECT holiday_date, name, added_by FROM public_holiday WHERE extract(year FROM holiday_date) = $1 ORDER BY holiday_date", [year]);
  return r.rows.map((h) => ({ date: h.holiday_date as IsoDate, name: h.name as string, addedBy: (h.added_by as string) ?? null }));
}

/** Holidays change which days count, so they may only change on dates the parties have not agreed yet. */
async function assertOpen(tx: Parameters<Parameters<typeof withTx>[0]>[0], date: IsoDate, today: IsoDate) {
  const m = (await tx.query("SELECT max(report_month) AS m FROM monthly_report")).rows[0].m;
  if (m && date <= monthBounds(m.trim()).last) throw rejected("MONTH_CLOSED", "That month's report is already accepted.");
  if (date < today) throw rejected("PAST_DATE", "Holidays can only be changed for today or later.");
}

export async function addHoliday(admin: CurrentUser, input: z.infer<typeof holidayInput>) {
  return withTx(async (tx) => {
    const n = await now(tx);
    await assertOpen(tx, input.date, n.date);
    if ((await tx.query("SELECT 1 FROM public_holiday WHERE holiday_date = $1", [input.date])).rowCount) throw conflict("EXISTS", "That date is already a holiday.");
    const used = await tx.query(
      `SELECT (SELECT count(*) FROM attendance WHERE work_date = $1) + (SELECT count(*) FROM leave_request
         WHERE status IN ('PENDING', 'APPROVED') AND $1 BETWEEN start_date AND end_date) AS n`, [input.date]);
    if (Number(used.rows[0].n) > 0) throw rejected("HAS_RECORDS", "Check-ins or leave already exist on that date. Resolve them first.");
    await tx.query("INSERT INTO public_holiday (holiday_date, name, added_by, added_at) VALUES ($1, $2, $3, $4)", [input.date, input.name, admin.id, n.instant]);
    await appendLedger(tx, { actorId: admin.id, eventType: "HOLIDAY_ADDED", occurredAt: n.instant, payload: { date: input.date, name: input.name } });
  });
}

export async function removeHoliday(admin: CurrentUser, date: IsoDate) {
  return withTx(async (tx) => {
    const n = await now(tx);
    await assertOpen(tx, date, n.date);
    const r = await tx.query("DELETE FROM public_holiday WHERE holiday_date = $1", [date]);
    if (!r.rowCount) throw notFound("Holiday");
    await appendLedger(tx, { actorId: admin.id, eventType: "HOLIDAY_REMOVED", occurredAt: n.instant, payload: { date } });
  });
}
