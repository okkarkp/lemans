import { expect, test } from "@playwright/test";
import { apiPost, reseed, signIn } from "./helpers";

test.beforeEach(async () => { await reseed(); });

test("a leave request reaches the supervisor's notifications, which can be read", async ({ page }) => {
  await signIn(page, "Personnel 01");
  await page.getByLabel("From", { exact: true }).fill("2026-09-28");
  await page.getByLabel("To", { exact: true }).fill("2026-09-28");
  await page.getByRole("button", { name: "Send to IRAS supervisor" }).click();
  await expect(page.getByText(/sent to your IRAS supervisor/)).toBeVisible();

  await signIn(page, "IRAS Supervisor (demo)");
  await expect(page.getByRole("link", { name: /Notifications, 1 unread/ })).toBeVisible();
  await page.getByRole("link", { name: /Notifications/ }).click();
  await expect(page.getByText("Leave request waiting for approval")).toBeVisible();
  await page.getByRole("button", { name: "Mark all 1 as read" }).click();
  await expect(page.getByRole("link", { name: "Notifications" })).toBeVisible();
});

test("moving the demo clock past 11:00 sends check-in reminders", async ({ page }) => {
  await signIn(page, "Accenture PMO (demo)");
  expect((await apiPost(page, "/api/demo/clock", { now: "2026-09-22T10:00" })).status()).toBe(200);
  await page.request.post("/api/demo/clock", { data: { now: "2026-09-22T11:05" }, headers: { origin: "http://localhost:3200" } });
  await signIn(page, "Personnel 03");
  await page.goto("/notifications");
  await expect(page.getByText("Reminder: check in today")).toBeVisible();
});
