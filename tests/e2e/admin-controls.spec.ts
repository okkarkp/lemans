import { expect, test } from "@playwright/test";
import { reseed, signIn } from "./helpers";

test.beforeEach(async () => { await reseed(); });

test("granting administrator rights needs a second administrator", async ({ page }) => {
  await signIn(page, "System Administrator (demo)");
  const add = page.getByRole("region", { name: "Add a user" });
  await add.getByLabel("Role").selectOption("ADMIN");
  await add.getByLabel(/Login ID/).fill("third.admin");
  await add.getByLabel("Name").fill("Third Admin");
  await add.getByRole("button", { name: "Create user" }).click();
  await expect(page.getByText(/A second administrator must approve/)).toBeVisible();
  const grants = page.getByRole("region", { name: /Administrator rights waiting/ });
  await expect(grants.getByText("Needs another administrator")).toBeVisible();

  await signIn(page, "System Administrator 2 (demo)");
  await page.getByRole("region", { name: /Administrator rights waiting/ }).getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("region", { name: /Administrator rights waiting/ })).toHaveCount(0);
  await page.goto("/login");
  await page.context().clearCookies();
  await page.goto("/login");
  await expect(page.getByLabel("Identity").locator("option", { hasText: "Third Admin" })).toHaveCount(1);
});

test("signing a user out everywhere ends their open session", async ({ browser }) => {
  const userCtx = await browser.newContext();
  const user = await userCtx.newPage();
  await signIn(user, "Personnel 02");
  const adminCtx = await browser.newContext();
  const adm = await adminCtx.newPage();
  await signIn(adm, "System Administrator (demo)");
  await adm.getByRole("button", { name: "Sign out Personnel 02 everywhere" }).click();
  await expect(adm.getByText("Personnel 02 has been signed out everywhere.")).toBeVisible();
  await user.goto("/me");
  await expect(user).toHaveURL(/\/login$/);
  await userCtx.close(); await adminCtx.close();
});

test("bulk import is checked first, then applied in full", async ({ page }) => {
  await signIn(page, "System Administrator (demo)");
  const imp = page.getByRole("region", { name: "Bulk import" });
  await expect(imp.getByRole("button", { name: "Import" })).toBeDisabled();
  await imp.getByRole("button", { name: "Insert example" }).click();
  await imp.getByRole("button", { name: "Check file" }).click();
  await expect(imp.getByText(/Check passed: 1 user/)).toBeVisible();
  await imp.getByRole("button", { name: "Import" }).click();
  await expect(imp.getByText("Imported 1 user(s).")).toBeVisible();
  await expect(page.getByRole("region", { name: /^Users/ })).toContainText("new.dev");
});

test("administrators maintain public holidays", async ({ page }) => {
  await signIn(page, "System Administrator (demo)");
  const ph = page.getByRole("region", { name: /Public holidays 2026/ });
  await ph.getByLabel("Date").fill("2026-12-25");
  await ph.getByLabel("Name").fill("Christmas Day");
  await ph.getByRole("button", { name: "Add" }).click();
  await expect(ph).toContainText("Christmas Day");
  await ph.getByRole("button", { name: "Remove Christmas Day" }).click();
  await expect(ph).not.toContainText("Christmas Day");
});
