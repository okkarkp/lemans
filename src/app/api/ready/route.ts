import { NextResponse } from "next/server";
import { pool } from "@/server/db";

/** Readiness: can serve traffic, i.e. the database answers. */
export async function GET() {
  try {
    await pool().query("SELECT 1");
    return NextResponse.json({ status: "ready" });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
