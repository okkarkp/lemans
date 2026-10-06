import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { config } from "@/server/config";
import { AppError } from "@/server/errors";
import { runDueJobs } from "@/server/services/jobs";

/**
 * Local trigger for scheduled jobs, called by cron on the host. Requires the shared token and is
 * additionally blocked at the reverse proxy, so it is never reachable from the internet.
 */
export async function POST(req: Request) {
  const expected = config().JOBS_TOKEN;
  const given = req.headers.get("x-jobs-token") ?? "";
  if (!expected || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  }
  try {
    return NextResponse.json(await runDueJobs());
  } catch (err) {
    console.error("jobs run failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: { code: "JOBS_FAILED", message: err instanceof AppError ? err.message : "Job run failed." } }, { status: 500 });
  }
}
