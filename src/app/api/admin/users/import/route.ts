import { NextResponse } from "next/server";
import { z } from "zod";
import { authorise } from "@/server/auth/session";
import { readJson, route } from "@/server/http/handler";
import { importUsers } from "@/server/services/user-import";

const input = z.object({ csv: z.string().min(1, "Paste or choose a CSV file.").max(500_000, "The file is too large."), dryRun: z.boolean() });

export const POST = route(async (req) => {
  const admin = await authorise(["ADMIN"]);
  const { csv, dryRun } = input.parse(await readJson(req));
  return NextResponse.json(await importUsers(admin, csv, dryRun));
});
