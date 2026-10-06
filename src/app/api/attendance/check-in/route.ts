import { NextResponse } from "next/server";
import { z } from "zod";
import { authorise } from "@/server/auth/session";
import { readJson, route } from "@/server/http/handler";
import { checkIn } from "@/server/services/attendance";
import { resolveTrustSignals } from "@/server/trust";

const input = z.object({ location: z.enum(["OFFICE", "WFH"]) });

export const POST = route(async (req) => {
  const user = await authorise(["PERSONNEL"]);
  const { location } = input.parse(await readJson(req));
  const outcome = await checkIn(user, location, await resolveTrustSignals());
  return NextResponse.json(outcome, { status: outcome.accepted ? 201 : 422 });
});
