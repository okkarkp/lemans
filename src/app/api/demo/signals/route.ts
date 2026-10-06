import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { config } from "@/server/config";
import { authorise } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { readJson, route } from "@/server/http/handler";
import { DEMO_SIGNALS_COOKIE } from "@/server/trust";

const input = z.object({ device: z.enum(["WOG_LAPTOP", "PERSONAL_PHONE"]), network: z.enum(["OFFICE", "REMOTE"]) });

export const POST = route(async (req) => {
  if (!config().DEMO_MODE) throw new AppError(404, "NOT_FOUND", "Not found.");
  await authorise(["PERSONNEL", "SUPERVISOR", "PMO"]);
  const { device, network } = input.parse(await readJson(req));
  (await cookies()).set(DEMO_SIGNALS_COOKIE, `${device}|${network}`, { httpOnly: true, sameSite: "lax", path: "/" });
  return NextResponse.json({ ok: true });
});
