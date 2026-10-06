import { NextResponse } from "next/server";
import { authorise } from "@/server/auth/session";
import { route } from "@/server/http/handler";
import { signOutEverywhere } from "@/server/services/users";

export const POST = route<RouteContext<"/api/admin/users/[id]/sign-out-everywhere">>(async (_req, ctx) => {
  const admin = await authorise(["ADMIN"]);
  return NextResponse.json(await signOutEverywhere(admin, (await ctx.params).id));
});
