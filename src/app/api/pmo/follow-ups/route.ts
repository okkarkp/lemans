import { NextResponse } from "next/server";
import { authorise } from "@/server/auth/session";
import { readJson, route } from "@/server/http/handler";
import { followUpInput, recordFollowUp } from "@/server/services/pmo";

export const POST = route(async (req) => {
  const user = await authorise(["PMO"]);
  const { personnelId } = followUpInput.parse(await readJson(req));
  await recordFollowUp(user, personnelId);
  return NextResponse.json({ ok: true }, { status: 201 });
});
