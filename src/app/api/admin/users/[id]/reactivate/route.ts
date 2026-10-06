import { NextResponse } from "next/server";
import { authorise } from "@/server/auth/session";
import { route } from "@/server/http/handler";
import { reactivateUser } from "@/server/services/users";

export const POST = route<RouteContext<"/api/admin/users/[id]/reactivate">>(async (_req, ctx) => {
  const admin = await authorise(["ADMIN"]);
  await reactivateUser(admin, (await ctx.params).id);
  return NextResponse.json({ ok: true });
});
