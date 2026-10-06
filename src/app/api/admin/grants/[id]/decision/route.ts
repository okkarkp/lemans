import { NextResponse } from "next/server";
import { z } from "zod";
import { authorise } from "@/server/auth/session";
import { badRequest } from "@/server/errors";
import { readJson, route } from "@/server/http/handler";
import { decideAdminGrant } from "@/server/services/users";

const input = z.object({ approve: z.boolean() });

export const POST = route<RouteContext<"/api/admin/grants/[id]/decision">>(async (req, ctx) => {
  const admin = await authorise(["ADMIN"]);
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) throw badRequest("BAD_ID", "Invalid id.");
  return NextResponse.json(await decideAdminGrant(admin, id, input.parse(await readJson(req)).approve));
});
