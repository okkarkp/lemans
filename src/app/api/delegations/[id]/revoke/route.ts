import { NextResponse } from "next/server";
import { authorise } from "@/server/auth/session";
import { badRequest } from "@/server/errors";
import { route } from "@/server/http/handler";
import { revokeDelegation } from "@/server/services/teams";

export const POST = route<RouteContext<"/api/delegations/[id]/revoke">>(async (_req, ctx) => {
  const user = await authorise(["SUPERVISOR", "ADMIN"]);
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) throw badRequest("BAD_ID", "Invalid delegation id.");
  await revokeDelegation(user, id);
  return NextResponse.json({ ok: true });
});
