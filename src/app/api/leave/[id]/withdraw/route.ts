import { NextResponse } from "next/server";
import { authorise } from "@/server/auth/session";
import { badRequest } from "@/server/errors";
import { route } from "@/server/http/handler";
import { withdrawLeave } from "@/server/services/leave";

export const POST = route<RouteContext<"/api/leave/[id]/withdraw">>(async (_req, ctx) => {
  const user = await authorise(["PERSONNEL"]);
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) throw badRequest("BAD_ID", "Invalid request id.");
  return NextResponse.json(await withdrawLeave(user, id));
});
