/** Calendar arithmetic on ISO dates (YYYY-MM-DD). Dates are business dates in Singapore time. */
export type IsoDate = string;
export type IsoMonth = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export const isIsoMonth = (value: string) => ISO_MONTH.test(value);

function toUtc(date: IsoDate): Date {
  if (!isIsoDate(date)) throw new RangeError(`Invalid date: ${date}`);
  return new Date(`${date}T00:00:00Z`);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isWorkingDay(date: IsoDate, holidays: ReadonlySet<IsoDate>): boolean {
  const dow = toUtc(date).getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays.has(date);
}

/** Working days in [from, to], inclusive. */
export function workingDaysBetween(from: IsoDate, to: IsoDate, holidays: ReadonlySet<IsoDate>): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkingDay(d, holidays)) out.push(d);
  return out;
}

export function monthBounds(month: IsoMonth): { first: IsoDate; last: IsoDate } {
  if (!isIsoMonth(month)) throw new RangeError(`Invalid month: ${month}`);
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { first: `${month}-01`, last };
}

export const monthOf = (date: IsoDate): IsoMonth => date.slice(0, 7);

export function formatLongDate(date: IsoDate): string {
  return toUtc(date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
export function formatMonth(month: IsoMonth): string {
  return toUtc(`${month}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
