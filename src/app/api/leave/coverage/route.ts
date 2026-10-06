import { NextResponse } from "next/server";
import { z } from "zod";
import { authorise } from "@/server/auth/session";
import { pool } from "@/server/db";
import { addDays, isIsoDate } from "@/server/domain/calendar";
import { route } from "@/server/http/handler";
import { coverageFor } from "@/server/services/leave";

const query = z.object({
  start: z.string().refine(isIsoDate, "Invalid start date."),
  end: z.string().refine(isIsoDate, "Invalid end date."),
}).refine((q) => q.end >= q.start && q.end <= addDays(q.start, 60), "Choose a range of up to 60 days.");

export const GET = route(async (req) => {
  const user = await authorise(["PERSONNEL"]);
  const url = new URL(req.url);
  const { start, end } = query.parse({ start: url.searchParams.get("start"), end: url.searchParams.get("end") });
  const cov = await coverageFor(pool(), user.personnelId!, start, end);
  return NextResponse.json({ minRatio: cov.minRatio, worstDay: cov.worstDay, floor: cov.floor, passes: cov.passes, workingDays: cov.workingDays });
});
