import { NextResponse } from "next/server";
import { destroySession } from "@/server/auth/session";
import { route } from "@/server/http/handler";

export const POST = route(async () => {
  await destroySession();
  return NextResponse.json({ redirectTo: "/login" });
});
