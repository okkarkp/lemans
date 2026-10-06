import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { reseed, testDatabaseUrl, withClient } from "../support/test-db";

const SECRET = new TextEncoder().encode("test-only-session-key-not-used-for-anything-real");

/** A real server-side session row plus its signed cookie value, for HTTP-level tests. */
export async function sessionToken(userId: string, opts: { sid?: string; exp?: string | number; key?: Uint8Array } = {}) {
  const sid = opts.sid ?? randomUUID();
  if (!opts.sid) {
    await withClient(testDatabaseUrl(), (c) => c.query(
      "INSERT INTO user_session (id, user_id, expires_at) SELECT $1, $2, now() + interval '1 hour' WHERE EXISTS (SELECT 1 FROM app_user WHERE id = $2)",
      [sid, userId]));
  }
  return new SignJWT({ sid }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuer("lemans2")
    .setIssuedAt().setExpirationTime(opts.exp ?? "1h").sign(opts.key ?? SECRET);
}
export const dbExec = (sql: string, params: unknown[] = []) => withClient(testDatabaseUrl(), (c) => c.query(sql, params));

export const BASE = "http://localhost:3200";
export { reseed };

export async function signIn(page: Page, name: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Identity").selectOption({ label: name });
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
}

export async function setSignals(page: Page, device: "WOG laptop (managed)" | "Personal phone (unmanaged)", network: "IRAS office network" | "Remote / home") {
  const bar = page.getByLabel("Demonstration controls");
  await bar.getByLabel("Device").selectOption({ label: device });
  await expect(bar.getByLabel("Device")).toBeEnabled();
  await bar.getByLabel("Network").selectOption({ label: network });
  await expect(bar.getByLabel("Network")).toBeEnabled();
}

export async function setBusinessDate(page: Page, date: string) {
  await page.getByLabel("Demonstration controls").getByLabel("Business date").fill(date);
  await expect(page.getByLabel("Demonstration controls").getByLabel("Business date")).toHaveValue(date);
}

/** State-changing API call from the signed-in browser context, with the Origin header a browser would send. */
export async function apiPost(page: Page, path: string, data: unknown) {
  return page.request.post(path, { data, headers: { origin: BASE } });
}
