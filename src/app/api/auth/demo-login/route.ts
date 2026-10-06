import { NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/server/config";
import { pool } from "@/server/db";
import { createSession, homeFor, type Role } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { readJson, route } from "@/server/http/handler";

const input = z.object({ userId: z.string().min(1) });

/** Stand-in for the WOG SSO callback. Disabled outside demo mode. */
export const POST = route(async (req) => {
  if (!config().DEMO_MODE) throw new AppError(404, "NOT_FOUND", "Not found.");
  const { userId } = input.parse(await readJson(req));
  const r = await pool().query<{ id: string; role: Role }>("SELECT id, role FROM app_user WHERE id = $1 AND active", [userId]);
  if (!r.rows[0]) throw new AppError(401, "UNKNOWN_USER", "Unknown user.");
  await createSession(r.rows[0].id);
  return NextResponse.json({ redirectTo: homeFor(r.rows[0].role) });
});
