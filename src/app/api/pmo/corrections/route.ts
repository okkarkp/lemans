import { NextResponse } from "next/server";
import { authorise } from "@/server/auth/session";
import { readJson, route } from "@/server/http/handler";
import { correctionInput, recordCorrection } from "@/server/services/pmo";

export const POST = route(async (req) => {
  const user = await authorise(["PMO"]);
  await recordCorrection(user, correctionInput.parse(await readJson(req)));
  return NextResponse.json({ ok: true }, { status: 201 });
});
