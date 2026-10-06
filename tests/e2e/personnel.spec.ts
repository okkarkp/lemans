import { expect, test } from "@playwright/test";
import { reseed, setSignals, signIn } from "./helpers";

test.beforeEach(async () => { await reseed(); });

test("check-in is refused without trusted evidence, then accepted with it", async ({ page }) => {
  await signIn(page, "Personnel 03");
  await expect(page.getByRole("heading", { name: "Good afternoon, Personnel 03" })).toBeVisible();
  await expect(page.getByText("You have not checked in yet and the midday check has passed")).toBeVisible();

  await setSignals(page, "Personal phone (unmanaged)", "Remote / home");
  await page.getByRole("button", { name: "Work from home" }).click();
  await page.getByRole("button", { name: "CHECK IN" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("must be made from a managed WOG device");

  await setSignals(page, "WOG laptop (managed)", "IRAS office network");
  await page.getByRole("button", { name: "Work from home" }).click();
  await page.getByRole("button", { name: "CHECK IN" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("came from the IRAS office network");

  await setSignals(page, "WOG laptop (managed)", "Remote / home");
  await page.getByRole("button", { name: "Work from home" }).click();
  await page.getByRole("button", { name: "CHECK IN" }).click();
  await expect(page.getByText("Checked in at 12:30 - working from home")).toBeVisible();
  await expect(page.getByText("Strength: Strong")).toBeVisible();
  await expect(page.getByRole("button", { name: "CHECK IN" })).toHaveCount(0);
});

test("leave form blocks an SLA breach and sends a compliant request", async ({ page }) => {
  await signIn(page, "Personnel 01");
  const send = page.getByRole("button", { name: "Send to IRAS supervisor" });

  await send.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Choose a start date");

  await page.getByLabel("From", { exact: true }).fill("2026-09-29");
  await page.getByLabel("To", { exact: true }).fill("2026-09-30");
  await expect(page.getByText("SLA check failed.")).toBeVisible();
  await expect(send).toBeDisabled();

  await page.getByLabel("From", { exact: true }).fill("2026-09-28");
  await page.getByLabel("To", { exact: true }).fill("2026-09-28");
  await expect(page.getByText("SLA check passed.")).toBeVisible();
  await page.getByLabel("Backup (confirmed with)").selectOption({ label: "Personnel 04" });
  await send.click();
  await expect(page.getByText(/Request LR-\d+ sent to your IRAS supervisor/)).toBeVisible();
  await expect(page.getByRole("region", { name: "My leave requests" }).getByText("Pending")).toBeVisible();
});

test("the month calendar shows worked, leave and gap days", async ({ page }) => {
  await signIn(page, "Personnel 06");
  const month = page.getByRole("list", { name: "Day by day" });
  await expect(month.getByTitle(/15 September 2026: GAP/)).toBeVisible();
  await expect(month.getByTitle(/14 September 2026: WORKED/)).toBeVisible();
  await expect(page.getByRole("region", { name: "This month so far" })).toContainText("Gaps");
});
