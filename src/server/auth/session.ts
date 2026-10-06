import "server-only";
import { randomUUID } from "node:crypto";
import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "../config";
import { pool, type Db } from "../db";
import { forbidden, unauthorised } from "../errors";

export type Role = "PERSONNEL" | "SUPERVISOR" | "PMO" | "ADMIN";
export interface CurrentUser {
  id: string;
  displayName: string;
  role: Role;
  personnelId: string | null;
}

export const SESSION_COOKIE = "lemans_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const TOUCH_AFTER_SECONDS = 60;
const ISSUER = "lemans2";

const key = () => new TextEncoder().encode(config().SESSION_SECRET);

/**
 * Sessions live on the server. The cookie carries a signed reference (user id + session id), so a
 * session can be ended at any time - on sign-out, after the idle timeout, when the account is
 * deactivated, or by an administrator - and the cookie stops working immediately.
 */
export async function createSession(userId: string): Promise<void> {
  const sid = randomUUID();
  await pool().query(
    "INSERT INTO user_session (id, user_id, expires_at) VALUES ($1, $2, now() + make_interval(secs => $3))",
    [sid, userId, SESSION_TTL_SECONDS]);
  const token = await new SignJWT({ sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_TTL_SECONDS,
  });
}

async function readToken(): Promise<{ userId: string; sid: string } | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: ISSUER, algorithms: ["HS256"] });
    return typeof payload.sub === "string" && typeof payload.sid === "string" ? { userId: payload.sub, sid: payload.sid } : null;
  } catch {
    return null; // expired or tampered token: treat as signed out
  }
}

export async function destroySession(): Promise<void> {
  const t = await readToken();
  if (t) await pool().query("UPDATE user_session SET revoked_at = now(), revoked_reason = 'SIGNED_OUT' WHERE id = $1 AND revoked_at IS NULL", [t.sid]);
  (await cookies()).delete(SESSION_COOKIE);
}

/** Ends every open session of a user. Runs in the caller's transaction when one is given. */
export async function revokeAllSessions(db: Db, userId: string, reason: string): Promise<number> {
  const r = await db.query("UPDATE user_session SET revoked_at = now(), revoked_reason = $2 WHERE user_id = $1 AND revoked_at IS NULL", [userId, reason]);
  return r.rowCount ?? 0;
}

/**
 * The signed-in user, or null. Checks the token, then the session row (not revoked, not expired,
 * active within the idle timeout) and the account (active), and reloads the role every time.
 * Cached per request, so layout and page share one lookup.
 */
export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  const t = await readToken();
  if (!t) return null;
  const r = await pool().query(
    `SELECT u.id, u.display_name, u.role, u.personnel_id,
            s.last_seen_at < now() - make_interval(secs => $4) AS stale
     FROM user_session s JOIN app_user u ON u.id = s.user_id
     WHERE s.id = $1 AND s.user_id = $2 AND s.revoked_at IS NULL AND s.expires_at > now()
       AND s.last_seen_at > now() - make_interval(mins => $3) AND u.active`,
    [t.sid, t.userId, config().SESSION_IDLE_MINUTES, TOUCH_AFTER_SECONDS]);
  const u = r.rows[0];
  if (!u) return null;
  // Sliding idle timeout, written at most once a minute per session.
  if (u.stale) await pool().query("UPDATE user_session SET last_seen_at = now() WHERE id = $1", [t.sid]);
  return { id: u.id, displayName: u.display_name, role: u.role, personnelId: u.personnel_id };
});

/** For route handlers: throws 401/403. */
export async function authorise(roles: Role[]): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) throw unauthorised();
  if (!roles.includes(user.role)) throw forbidden();
  return user;
}

/** For pages: redirects to sign-in, or to the user's own home if the role is not allowed. */
export async function requirePageUser(roles: Role[]): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!roles.includes(user.role)) redirect(homeFor(user.role));
  return user;
}

export const homeFor = (role: Role) => ({ PERSONNEL: "/me", SUPERVISOR: "/supervisor", PMO: "/pmo", ADMIN: "/admin/users" })[role];
