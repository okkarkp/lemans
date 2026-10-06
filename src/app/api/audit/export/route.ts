import { z } from "zod";
import { authorise } from "@/server/auth/session";
import { addDays, isIsoDate } from "@/server/domain/calendar";
import { route } from "@/server/http/handler";
import { exportLedgerCsv } from "@/server/services/audit";

const query = z.object({
  from: z.string().refine(isIsoDate, "Invalid start date."),
  to: z.string().refine(isIsoDate, "Invalid end date."),
}).refine((q) => q.to >= q.from && q.to <= addDays(q.from, 366), "Choose a range of up to one year.");

export const GET = route(async (req) => {
  await authorise(["SUPERVISOR", "PMO", "ADMIN"]);
  const u = new URL(req.url);
  const { from, to } = query.parse({ from: u.searchParams.get("from"), to: u.searchParams.get("to") });
  return new Response(await exportLedgerCsv(from, to), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="lemans-ledger-${from}-to-${to}.csv"`, "cache-control": "no-store" },
  });
});
