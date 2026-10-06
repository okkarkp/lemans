import { NextResponse } from "next/server";
import { authorise } from "@/server/auth/session";
import { pool } from "@/server/db";
import { notFound } from "@/server/errors";
import { readJson, route } from "@/server/http/handler";
import { balances, entitlementInput, setEntitlements } from "@/server/services/entitlements";

async function personnelOf(userId: string) {
  const r = await pool().query("SELECT personnel_id FROM app_user WHERE id = $1 AND personnel_id IS NOT NULL", [userId]);
  if (!r.rows[0]) throw notFound("Service personnel");
  return r.rows[0].personnel_id as string;
}

export const GET = route<RouteContext<"/api/admin/users/[id]/entitlements">>(async (req, ctx) => {
  await authorise(["ADMIN"]);
  const year = Number(new URL(req.url).searchParams.get("year"));
  const pid = await personnelOf((await ctx.params).id);
  return NextResponse.json(await balances(pid, Number.isInteger(year) && year > 2000 ? year : new Date().getFullYear()));
});

export const PUT = route<RouteContext<"/api/admin/users/[id]/entitlements">>(async (req, ctx) => {
  const admin = await authorise(["ADMIN"]);
  const pid = await personnelOf((await ctx.params).id);
  await setEntitlements(admin, pid, entitlementInput.parse(await readJson(req)));
  return NextResponse.json({ ok: true });
});
