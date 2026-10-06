import { NextResponse } from "next/server";
import { authorise } from "@/server/auth/session";
import { readJson, route } from "@/server/http/handler";
import { createUser, createUserInput } from "@/server/services/users";

export const POST = route(async (req) => {
  const admin = await authorise(["ADMIN"]);
  return NextResponse.json(await createUser(admin, createUserInput.parse(await readJson(req))), { status: 201 });
});
