import { expect, test } from "@playwright/test";
import { apiPost, reseed, signIn } from "./helpers";

test.beforeEach(async () => { await reseed(); });

test("administrator creates, edits, deactivates and reactivates users", async ({ page }) => {
  await signIn(page, "System Administrator (demo)");
  await expect(page).toHaveURL(/\/admin\/users$/);
  const add = page.getByRole("region", { name: "Add a user" });

  await add.getByRole("button", { name: "Create user" }).click();
  await expect(add.getByRole("alert")).toContainText("Login ID must be");

  await add.getByLabel(/Login ID/).fill("new.tester");
  await add.getByLabel("Name").fill("Personnel 07");
  await add.getByLabel("Job title").fill("Test analyst");
  await add.getByLabel("Assigned from").fill("2026-09-21");
  await add.getByRole("button", { name: "Create user" }).click();
  await expect(page.getByText("Created new.tester as SP07.")).toBeVisible();

  const list = page.getByRole("region", { name: /^Users/ });
  const row = list.getByRole("listitem").filter({ hasText: "new.tester" });
  await expect(row).toContainText("SP07, Test analyst");

  await row.getByRole("button", { name: "Edit Personnel 07" }).click();
  await row.getByLabel("Job title").fill("Senior test analyst");
  await row.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved changes to Personnel 07.")).toBeVisible();
  await expect(row).toContainText("Senior test analyst");

  await row.getByRole("button", { name: "Deactivate Personnel 07" }).click();
  await row.getByRole("button", { name: "Confirm deactivation" }).click();
  await expect(page.getByText("Personnel 07 has been deactivated.")).toBeVisible();

  await page.getByLabel("Status").selectOption("inactive");
  const inactive = list.getByRole("listitem").filter({ hasText: "new.tester" });
  await expect(inactive.getByText("Deactivated")).toBeVisible();
  await inactive.getByRole("button", { name: "Reactivate Personnel 07" }).click();
  await expect(page.getByText("Personnel 07 can sign in again.")).toBeVisible();
});

test("the administrator cannot lock themselves out, and errors are shown", async ({ page }) => {
  await signIn(page, "System Administrator (demo)");
  const me = page.getByRole("region", { name: /^Users/ }).getByRole("listitem").filter({ hasText: "u-admin01" });
  await expect(me.getByRole("button", { name: /^Deactivate/ })).toHaveCount(0);
  await me.getByRole("button", { name: /^Edit/ }).click();
  await expect(me.getByLabel("Role")).toBeDisabled();
  expect((await apiPost(page, "/api/admin/users/u-admin01/deactivate", {})).status()).toBe(422);

  const sp04 = page.getByRole("region", { name: /^Users/ }).getByRole("listitem").filter({ hasText: "u-sp04" });
  await sp04.getByRole("button", { name: "Deactivate Personnel 04" }).click();
  await sp04.getByLabel("Last working day on the contract").fill("2026-09-15");
  await sp04.getByRole("button", { name: "Confirm deactivation" }).click();
  await expect(sp04.getByRole("alert")).toContainText("outside the new assignment period");
});

test("a deactivated user is signed out at once and cannot sign back in", async ({ browser }) => {
  const userCtx = await browser.newContext();
  const user = await userCtx.newPage();
  await signIn(user, "Personnel 06");

  const adminCtx = await browser.newContext();
  const adm = await adminCtx.newPage();
  await signIn(adm, "System Administrator (demo)");
  expect((await apiPost(adm, "/api/admin/users/u-sp06/deactivate", {})).status()).toBe(200);

  await user.goto("/me");
  await expect(user).toHaveURL(/\/login$/);
  await expect(user.getByLabel("Identity").locator("option", { hasText: "Personnel 06" })).toHaveCount(0);
  const r = await user.request.post("/api/auth/demo-login", { data: { userId: "u-sp06" }, headers: { origin: "http://localhost:3200" } });
  expect(r.status()).toBe(401);
  await userCtx.close(); await adminCtx.close();
});
