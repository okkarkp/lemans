import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "../errors";

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/**
 * Wraps a route handler: same-origin check on state-changing methods (CSRF defence alongside the
 * SameSite cookie), consistent error envelope, and no internal detail leaked to the caller.
 */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    const requestId = randomUUID();
    try {
      if (req.method !== "GET" && req.method !== "HEAD" && !isSameOrigin(req)) {
        throw new AppError(403, "CSRF", "Cross-origin request rejected.");
      }
      const res = await handler(req, ctx);
      res.headers.set("x-request-id", requestId);
      return res;
    } catch (err) {
      if (err instanceof AppError) return problem(err.status, err.code, err.message, requestId);
      if (err instanceof ZodError) {
        return problem(400, "VALIDATION", err.issues.map((i) => i.message).join(" "), requestId);
      }
      if (isUniqueViolation(err)) return problem(409, "DUPLICATE", "This record already exists.", requestId);
      // Log type and message only - never the request body, which can carry personal data.
      console.error(`[${requestId}] ${req.method} ${new URL(req.url).pathname} failed:`, err instanceof Error ? err.message : err);
      return problem(500, "INTERNAL", "Something went wrong. Quote this reference to support.", requestId);
    }
  };
}

function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

const isUniqueViolation = (err: unknown) => typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";

function problem(status: number, code: string, message: string, requestId: string) {
  return NextResponse.json({ error: { code, message, requestId } }, { status, headers: { "x-request-id": requestId } });
}

export async function readJson(req: Request): Promise<unknown> {
  try { return await req.json(); } catch { throw new AppError(400, "BAD_JSON", "Request body must be valid JSON."); }
}
