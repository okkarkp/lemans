import { NextResponse } from "next/server";
import { authorise } from "@/server/auth/session";
import { readJson, route } from "@/server/http/handler";
import { createTeam, teamInput } from "@/server/services/teams";

export const POST = route(async (req) => {
  const admin = await authorise(["ADMIN"]);
  return NextResponse.json(await createTeam(admin, teamInput.parse(await readJson(req))), { status: 201 });
});
