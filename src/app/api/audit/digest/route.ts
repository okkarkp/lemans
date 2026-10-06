import { authorise } from "@/server/auth/session";
import { route } from "@/server/http/handler";
import { ledgerDigest } from "@/server/services/audit";

export const GET = route(async () => {
  await authorise(["SUPERVISOR", "PMO", "ADMIN"]);
  const d = await ledgerDigest();
  return new Response(JSON.stringify(d, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="lemans-ledger-digest-${d.generatedAt.slice(0, 10)}.json"`, "cache-control": "no-store" },
  });
});
