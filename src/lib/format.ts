const SGT = "Asia/Singapore";

export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

export function longDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}
export function shortDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
export function timeSgt(instant: string): string {
  return new Date(instant).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: SGT, hourCycle: "h23" });
}
export function dateTimeSgt(instant: string): string {
  return new Date(instant).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: SGT, hourCycle: "h23",
  });
}
