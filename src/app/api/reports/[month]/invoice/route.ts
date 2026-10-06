import { NextResponse } from "next/server";
import { authorise } from "@/server/auth/session";
import { isIsoMonth } from "@/server/domain/calendar";
import { badRequest } from "@/server/errors";
import { readJson, route } from "@/server/http/handler";
import { invoiceInput, recordInvoice } from "@/server/services/report";

export const POST = route<RouteContext<"/api/reports/[month]/invoice">>(async (req, ctx) => {
  const user = await authorise(["PMO"]);
  const { month } = await ctx.params;
  if (!isIsoMonth(month)) throw badRequest("BAD_MONTH", "Invalid month.");
  return NextResponse.json(await recordInvoice(user, month, invoiceInput.parse(await readJson(req))), { status: 201 });
});
