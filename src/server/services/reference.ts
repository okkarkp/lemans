import "server-only";
import type { Db } from "../db";
import type { IsoDate } from "../domain/calendar";

export interface Personnel { id: string; name: string; roleTitle: string; startDate: IsoDate; endDate: IsoDate | null; teamId: string }

export const isAssigned = (p: Pick<Personnel, "startDate" | "endDate">, day: IsoDate) =>
  p.startDate <= day && (p.endDate === null || day <= p.endDate);

/** Personnel whose assignment period overlaps [from, to]. */
export async function listPersonnel(db: Db, from: IsoDate, to: IsoDate = from): Promise<Personnel[]> {
  const r = await db.query(
    `SELECT id, display_name, role_title, start_date, end_date, team_id FROM personnel
     WHERE start_date <= $2 AND (end_date IS NULL OR end_date >= $1) ORDER BY id`, [from, to]);
  return r.rows.map((p) => ({ id: p.id, name: p.display_name, roleTitle: p.role_title, startDate: p.start_date, endDate: p.end_date, teamId: p.team_id }));
}

export async function holidaySet(db: Db, from: IsoDate, to: IsoDate): Promise<Set<IsoDate>> {
  const r = await db.query<{ holiday_date: string }>(
    "SELECT holiday_date FROM public_holiday WHERE holiday_date BETWEEN $1 AND $2", [from, to],
  );
  return new Set(r.rows.map((h) => h.holiday_date));
}
