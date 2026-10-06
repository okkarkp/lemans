import { NextResponse } from "next/server";
import { authorise } from "@/server/auth/session";
import { isIsoDate } from "@/server/domain/calendar";
import { badRequest } from "@/server/errors";
import { route } from "@/server/http/handler";
import { removeHoliday } from "@/server/services/holidays";

export const DELETE = route<RouteContext<"/api/admin/holidays/[date]">>(async (_req, ctx) => {
  const admin = await authorise(["ADMIN"]);
  const { date } = await ctx.params;
  if (!isIsoDate(date)) throw badRequest("BAD_DATE", "Invalid date.");
  await removeHoliday(admin, date);
  return NextResponse.json({ ok: true });
});
