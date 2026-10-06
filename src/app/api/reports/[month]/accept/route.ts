import { NextResponse } from "next/server";
import { authorise } from "@/server/auth/session";
import { isIsoMonth } from "@/server/domain/calendar";
import { badRequest } from "@/server/errors";
import { route } from "@/server/http/handler";
import { acceptReport } from "@/server/services/report";

export const POST = route<RouteContext<"/api/reports/[month]/accept">>(async (_req, ctx) => {
  const user = await authorise(["SUPERVISOR"]);
  const { month } = await ctx.params;
  if (!isIsoMonth(month)) throw badRequest("BAD_MONTH", "Invalid month.");
  return NextResponse.json(await acceptReport(user, month), { status: 201 });
});
