import { authorise } from "@/server/auth/session";
import { isIsoMonth } from "@/server/domain/calendar";
import { badRequest } from "@/server/errors";
import { route } from "@/server/http/handler";
import { getReport, toCsv } from "@/server/services/report";

export const GET = route<RouteContext<"/api/reports/[month]/csv">>(async (_req, ctx) => {
  await authorise(["SUPERVISOR", "PMO"]);
  const { month } = await ctx.params;
  if (!isIsoMonth(month)) throw badRequest("BAD_MONTH", "Invalid month.");
  const view = await getReport(month);
  return new Response(toCsv(view), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="lemans-report-${month}.csv"`,
      "cache-control": "no-store",
    },
  });
});
