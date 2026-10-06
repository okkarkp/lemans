import { NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/server/config";
import { pool } from "@/server/db";
import { DEMO_NOW_PATTERN, setDemoNow } from "@/server/clock";
import { authorise } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { readJson, route } from "@/server/http/handler";

const input = z.object({ now: z.string().regex(DEMO_NOW_PATTERN, "Use YYYY-MM-DDTHH:mm.") });

export const POST = route(async (req) => {
  if (!config().DEMO_MODE) throw new AppError(404, "NOT_FOUND", "Not found.");
  await authorise(["PERSONNEL", "SUPERVISOR", "PMO"]);
  await setDemoNow(pool(), input.parse(await readJson(req)).now);
  return NextResponse.json({ ok: true });
});
