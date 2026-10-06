import { NextResponse } from "next/server";
import { authorise } from "@/server/auth/session";
import { readJson, route } from "@/server/http/handler";
import { leaveInput, submitLeave } from "@/server/services/leave";

export const POST = route(async (req) => {
  const user = await authorise(["PERSONNEL"]);
  const result = await submitLeave(user, leaveInput.parse(await readJson(req)));
  return NextResponse.json(result, { status: 201 });
});
