import { NextResponse } from "next/server";
import { authorise } from "@/server/auth/session";
import { readJson, route } from "@/server/http/handler";
import { updateUser, updateUserInput } from "@/server/services/users";

export const PATCH = route<RouteContext<"/api/admin/users/[id]">>(async (req, ctx) => {
  const admin = await authorise(["ADMIN"]);
  const { id } = await ctx.params;
  return NextResponse.json(await updateUser(admin, id, updateUserInput.parse(await readJson(req))));
});
