import { NextResponse } from "next/server";
import { authorise } from "@/server/auth/session";
import { readJson, route } from "@/server/http/handler";
import { createDelegation, delegationInput } from "@/server/services/teams";

export const POST = route(async (req) => {
  const user = await authorise(["SUPERVISOR", "ADMIN"]);
  return NextResponse.json(await createDelegation(user, delegationInput.parse(await readJson(req))), { status: 201 });
});
