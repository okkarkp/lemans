import { expect, test } from "@playwright/test";
import { apiPost, BASE, dbExec, reseed, sessionToken, signIn } from "./helpers";

test.beforeAll(async () => { await reseed(); });

test.describe("access control", () => {
  test("signed-out users are sent to sign-in", async ({ page }) => {
    for (const path of ["/me", "/supervisor", "/pmo", "/reports", "/audit"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test("each role only reaches its own screens", async ({ page }) => {
    await signIn(page, "Personnel 01");
    for (const path of ["/supervisor", "/pmo", "/reports", "/audit"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/me$/);
    }
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/me$/);
    await signIn(page, "Accenture PMO (demo)");
    await page.goto("/supervisor");
    await expect(page).toHaveURL(/\/pmo$/);
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/pmo$/);
    await signIn(page, "System Administrator (demo)");
    for (const path of ["/me", "/supervisor", "/pmo", "/reports"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/users$/);
    }
  });

  test("APIs enforce roles on the server", async ({ page }) => {
    await signIn(page, "Personnel 01");
    expect((await apiPost(page, "/api/leave/1/decision", { decision: "APPROVE" })).status()).toBe(403);
    expect((await apiPost(page, "/api/pmo/corrections", { personnelId: "SP06", workDate: "2026-09-15", outcome: "LEAVE", reason: "self-serve" })).status()).toBe(403);
    expect((await apiPost(page, "/api/reports/2026-09/accept", {})).status()).toBe(403);
    expect((await page.request.get("/api/reports/2026-08/csv")).status()).toBe(403);
    await signIn(page, "Accenture PMO (demo)");
    expect((await apiPost(page, "/api/reports/2026-09/accept", {})).status()).toBe(403);
    expect((await apiPost(page, "/api/attendance/check-in", { location: "OFFICE" })).status()).toBe(403);
    for (const who of ["Accenture PMO (demo)", "IRAS Supervisor (demo)", "Personnel 01"]) {
      await signIn(page, who);
      expect((await apiPost(page, "/api/admin/users", { id: "sneaky", displayName: "Sneaky", role: "ADMIN" })).status()).toBe(403);
      expect((await page.request.patch("/api/admin/users/u-sp01", { data: { displayName: "Changed" }, headers: { origin: BASE } })).status()).toBe(403);
      expect((await apiPost(page, "/api/admin/users/u-sp02/deactivate", {})).status()).toBe(403);
    }
  });
});

test.describe("sessions", () => {
  test("no, expired, forged or unknown-user tokens are all treated as signed out", async ({ request }) => {
    const cases = [
      undefined,
      await sessionToken("u-sp01", { exp: Math.floor(Date.now() / 1000) - 60 }),
      await sessionToken("u-sp01", { key: new TextEncoder().encode("a-completely-different-key-of-sufficient-length") }),
      await sessionToken("u-nobody"),
      await sessionToken("u-sp01", { sid: "00000000-0000-4000-8000-000000000000" }), // well-signed, but no such session
      "not-a-jwt",
    ];
    for (const t of cases) {
      const r = await request.get("/api/leave/coverage?start=2026-09-28&end=2026-09-28", { headers: t ? { cookie: `lemans_session=${t}` } : {} });
      expect(r.status(), `token ${String(t).slice(0, 12)}`).toBe(401);
    }
    const ok = await request.get("/api/leave/coverage?start=2026-09-28&end=2026-09-28", { headers: { cookie: `lemans_session=${await sessionToken("u-sp01")}` } });
    expect(ok.status()).toBe(200);
  });

  test("signing out ends the session on the server, so a copied cookie stops working", async ({ page, request }) => {
    await signIn(page, "Personnel 01");
    const cookie = (await page.context().cookies()).find((c) => c.name === "lemans_session")!.value;
    const probe = () => request.get("/api/leave/coverage?start=2026-09-28&end=2026-09-28", { headers: { cookie: `lemans_session=${cookie}` } });
    expect((await probe()).status()).toBe(200);
    await apiPost(page, "/api/auth/logout", {});
    expect((await probe()).status()).toBe(401);
  });

  test("a session idle past the timeout is ended", async ({ page }) => {
    await signIn(page, "Personnel 01");
    await dbExec("UPDATE user_session SET last_seen_at = now() - interval '31 minutes' WHERE user_id = 'u-sp01' AND revoked_at IS NULL");
    await page.goto("/me");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("session cookie is HttpOnly, SameSite=Lax and Secure", async ({ page }) => {
    await signIn(page, "Personnel 01");
    const c = (await page.context().cookies()).find((x) => x.name === "lemans_session");
    expect(c).toMatchObject({ httpOnly: true, sameSite: "Lax", secure: true });
    await apiPost(page, "/api/auth/logout", {});
    expect((await page.context().cookies()).find((x) => x.name === "lemans_session")).toBeUndefined();
  });
});

test.describe("request hardening", () => {
  test("state-changing calls without a same-origin header are rejected", async ({ page }) => {
    await signIn(page, "Personnel 01");
    const noOrigin = await page.request.post("/api/leave", { data: {} });
    expect(noOrigin.status()).toBe(403);
    expect((await noOrigin.json()).error.code).toBe("CSRF");
    const evil = await page.request.post("/api/leave", { data: {}, headers: { origin: "https://evil.example" } });
    expect(evil.status()).toBe(403);
  });

  test("malformed input gets a clear 400 without internal detail", async ({ page }) => {
    await signIn(page, "IRAS Supervisor (demo)");
    const badJson = await page.request.post("/api/leave/1/decision", { data: "{not json", headers: { origin: BASE, "content-type": "application/json" } });
    expect(badJson.status()).toBe(400);
    expect((await apiPost(page, "/api/leave/abc/decision", { decision: "APPROVE" })).status()).toBe(400);
    expect((await apiPost(page, "/api/leave/1/decision", { decision: "MAYBE" })).status()).toBe(400);
    expect((await apiPost(page, "/api/reports/2026-13/accept", {})).status()).toBe(400);
    const body = await (await apiPost(page, "/api/leave/1/decision", { decision: 42 })).json();
    expect(body.error).toMatchObject({ code: "VALIDATION" });
    expect(JSON.stringify(body)).not.toMatch(/at \w+ \(|node_modules|stack/i);
    expect(body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("responses carry security headers and no framework banner", async ({ request }) => {
    const r = await request.get("/login");
    const h = r.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("health and readiness are separate", async ({ request }) => {
    expect(await (await request.get("/api/health")).json()).toEqual({ status: "ok" });
    expect(await (await request.get("/api/ready")).json()).toEqual({ status: "ready" });
  });
});

test.describe("production mode (DEMO_MODE=false)", () => {
  const PROD = "http://localhost:3201";
  test("demo sign-in, demo clock and demo signals are switched off", async ({ request }) => {
    expect((await request.get(`${PROD}/login`)).status()).toBe(404);
    const h = { origin: PROD };
    expect((await request.post(`${PROD}/api/auth/demo-login`, { data: { userId: "u-sup01" }, headers: h })).status()).toBe(404);
    expect((await request.post(`${PROD}/api/demo/clock`, { data: { now: "2026-10-01T09:00" }, headers: h })).status()).toBe(404);
    expect((await request.post(`${PROD}/api/demo/signals`, { data: { device: "WOG_LAPTOP", network: "OFFICE" }, headers: h })).status()).toBe(404);
    expect((await request.get(`${PROD}/api/health`)).status()).toBe(200);
  });

  test("the job trigger needs the exact token, and is off when no token is configured", async ({ request }) => {
    expect((await request.post("/api/internal/jobs", { headers: { "x-jobs-token": "anything" } })).status()).toBe(404);
    expect((await request.post(`${PROD}/api/internal/jobs`)).status()).toBe(404);
    expect((await request.post(`${PROD}/api/internal/jobs`, { headers: { "x-jobs-token": "test-only-jobs-token-0123456789abcdeX" } })).status()).toBe(404);
    const ok = await request.post(`${PROD}/api/internal/jobs`, { headers: { "x-jobs-token": "test-only-jobs-token-0123456789abcdef" } });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toHaveProperty("ran");
  });

  test("check-in evidence comes from the gateway headers, not the user", async ({ request }) => {
    const cookie = `lemans_session=${await sessionToken("u-sp03")}`;
    // Off the office network with no device-compliance header: WFH is refused.
    const remote = await request.post(`${PROD}/api/attendance/check-in`, {
      data: { location: "WFH" }, headers: { origin: PROD, cookie, "x-forwarded-for": "203.0.113.9" },
    });
    // The production server runs on the real clock, so on a weekend the day itself is refused first.
    expect(remote.status()).toBe(422);
    const body = await remote.json();
    expect(["UNMANAGED_DEVICE_REMOTE", "NOT_WORKING_DAY"]).toContain(body.code ?? body.error?.code);
    // Claiming the office from a non-office address is refused.
    const fake = await request.post(`${PROD}/api/attendance/check-in`, {
      data: { location: "OFFICE" }, headers: { origin: PROD, cookie, "x-forwarded-for": "203.0.113.9", "x-device-compliant": "true" },
    });
    expect(fake.status()).toBe(422);
    const f = await fake.json();
    expect(["OFFICE_NOT_ON_OFFICE_NETWORK", "NOT_WORKING_DAY"]).toContain(f.code ?? f.error?.code);
  });
});
