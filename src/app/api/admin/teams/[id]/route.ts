import { NextResponse } from "next/server";
import { authorise } from "@/server/auth/session";
import { readJson, route } from "@/server/http/handler";
import { teamUpdateInput, updateTeam } from "@/server/services/teams";

export const PATCH = route<RouteContext<"/api/admin/teams/[id]">>(async (req, ctx) => {
  const admin = await authorise(["ADMIN"]);
  await updateTeam(admin, (await ctx.params).id, teamUpdateInput.parse(await readJson(req)));
  return NextResponse.json({ ok: true });
});
