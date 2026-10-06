import { NextResponse } from "next/server";
import { authorise } from "@/server/auth/session";
import { readJson, route } from "@/server/http/handler";
import { addHoliday, holidayInput } from "@/server/services/holidays";

export const POST = route(async (req) => {
  const admin = await authorise(["ADMIN"]);
  await addHoliday(admin, holidayInput.parse(await readJson(req)));
  return NextResponse.json({ ok: true }, { status: 201 });
});
