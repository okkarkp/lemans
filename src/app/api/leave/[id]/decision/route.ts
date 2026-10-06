import { NextResponse } from "next/server";
import { authorise } from "@/server/auth/session";
import { badRequest } from "@/server/errors";
import { readJson, route } from "@/server/http/handler";
import { decideLeave, decisionInput } from "@/server/services/leave";

export const POST = route<RouteContext<"/api/leave/[id]/decision">>(async (req, ctx) => {
  const user = await authorise(["SUPERVISOR"]);
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) throw badRequest("BAD_ID", "Invalid request id.");
  return NextResponse.json(await decideLeave(user, id, decisionInput.parse(await readJson(req))));
});
