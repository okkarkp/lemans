import { NextResponse } from "next/server";
import { z } from "zod";
import { authorise } from "@/server/auth/session";
import { readJson, route } from "@/server/http/handler";
import { markRead } from "@/server/services/notify";

const input = z.object({ ids: z.union([z.literal("all"), z.array(z.number().int().positive()).max(200)]) });

export const POST = route(async (req) => {
  const user = await authorise(["PERSONNEL", "SUPERVISOR", "PMO", "ADMIN"]);
  return NextResponse.json({ updated: await markRead(user.id, input.parse(await readJson(req)).ids) });
});
