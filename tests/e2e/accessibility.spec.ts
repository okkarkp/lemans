import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { reseed, signIn } from "./helpers";

test.beforeAll(async () => { await reseed(); });

const screens: [string, string | null, string][] = [
  ["sign-in", null, "/login"],
  ["my day", "Personnel 03", "/me"],
  ["approvals", "IRAS Supervisor (demo)", "/supervisor"],
  ["monthly report", "IRAS Supervisor (demo)", "/reports?month=2026-08"],
  ["exceptions", "Accenture PMO (demo)", "/pmo"],
  ["audit ledger", "Accenture PMO (demo)", "/audit"],
  ["user management", "System Administrator (demo)", "/admin/users"],
  ["notifications", "IRAS Supervisor (demo)", "/notifications"],
];

for (const [label, who, path] of screens) {
  test(`${label} has no serious or critical WCAG 2.1 AA violations`, async ({ page }) => {
    if (who) await signIn(page, who); else await page.context().clearCookies();
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
  });
}

test("check-in can be completed with the keyboard alone", async ({ page }) => {
  await signIn(page, "Personnel 06");
  await page.getByRole("button", { name: "IRAS office" }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab"); // Work from home
  await page.keyboard.press("Tab"); // CHECK IN
  await expect(page.getByRole("button", { name: "CHECK IN" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Checked in at 12:30/)).toBeVisible();
});
