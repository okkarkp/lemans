import "server-only";
import type { Db } from "./db";
import { config } from "./config";
import type { IsoDate } from "./domain/calendar";

export interface Now {
  instant: Date;
  date: IsoDate;
  time: string; // HH:mm, Singapore time
}

const SGT = "Asia/Singapore";
const DEMO_NOW_KEY = "demo_now";
export const DEMO_NOW_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function fromSgtLocal(local: string): Now {
  return { instant: new Date(`${local}:00+08:00`), date: local.slice(0, 10), time: local.slice(11, 16) };
}

/** Business "now". In demo mode it is a settable clock so a month can be played through. */
export async function now(db: Db): Promise<Now> {
  if (config().DEMO_MODE) {
    const r = await db.query<{ value: string }>("SELECT value FROM app_setting WHERE key = $1", [DEMO_NOW_KEY]);
    if (r.rows[0] && DEMO_NOW_PATTERN.test(r.rows[0].value)) return fromSgtLocal(r.rows[0].value);
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SGT, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return fromSgtLocal(`${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`);
}

export async function setDemoNow(db: Db, local: string): Promise<void> {
  if (!config().DEMO_MODE) throw new Error("Demo clock is disabled");
  if (!DEMO_NOW_PATTERN.test(local)) throw new RangeError("Invalid demo time");
  await db.query(
    "INSERT INTO app_setting (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [DEMO_NOW_KEY, local],
  );
}

export const alertPassed = (n: Now) => n.time >= config().MISSING_CHECKIN_ALERT_TIME;
