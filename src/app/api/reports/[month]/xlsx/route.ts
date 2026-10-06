import { authorise } from "@/server/auth/session";
import { isIsoMonth } from "@/server/domain/calendar";
import { badRequest } from "@/server/errors";
import { route } from "@/server/http/handler";
import { getReport, toXlsx } from "@/server/services/report";

export const GET = route<RouteContext<"/api/reports/[month]/xlsx">>(async (_req, ctx) => {
  await authorise(["SUPERVISOR", "PMO"]);
  const { month } = await ctx.params;
  if (!isIsoMonth(month)) throw badRequest("BAD_MONTH", "Invalid month.");
  const body = await toXlsx(await getReport(month));
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="lemans-report-${month}.xlsx"`,
      "cache-control": "no-store",
    },
  });
});
