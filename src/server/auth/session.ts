import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "../config";
import { pool } from "../db";
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
const ISSUER = "lemans2";

const key = () => new TextEncoder().encode(config().SESSION_SECRET);

export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({})
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

export async function destroySession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Verifies the token (signature, issuer, expiry) and reloads the user, so role changes apply at once. */
export async function currentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  let userId: string | undefined;
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: ISSUER, algorithms: ["HS256"] });
    userId = payload.sub;
  } catch {
    return null; // expired or tampered token: treat as signed out
  }
  if (!userId) return null;
  const r = await pool().query(
    // A deactivated account loses access immediately, even mid-session.
    "SELECT id, display_name, role, personnel_id FROM app_user WHERE id = $1 AND active", [userId],
  );
  const u = r.rows[0];
  return u ? { id: u.id, displayName: u.display_name, role: u.role, personnelId: u.personnel_id } : null;
}

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
