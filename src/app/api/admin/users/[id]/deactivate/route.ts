import { NextResponse } from "next/server";
import { authorise } from "@/server/auth/session";
import { readJson, route } from "@/server/http/handler";
import { deactivateInput, deactivateUser } from "@/server/services/users";

export const POST = route<RouteContext<"/api/admin/users/[id]/deactivate">>(async (req, ctx) => {
  const admin = await authorise(["ADMIN"]);
  const { id } = await ctx.params;
  return NextResponse.json(await deactivateUser(admin, id, deactivateInput.parse(await readJson(req))));
});
