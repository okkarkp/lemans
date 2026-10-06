import { expect, test } from "@playwright/test";
import { reseed, signIn } from "./helpers";

test.beforeEach(async () => { await reseed(); });

test("half-day request, balance shown, then withdrawn", async ({ page }) => {
  await signIn(page, "Personnel 01");
  await expect(page.getByRole("region", { name: /Leave balance 2026/ })).toContainText("Annual leave");
  await page.getByLabel("From", { exact: true }).fill("2026-09-28");
  await page.getByLabel("To", { exact: true }).fill("2026-09-28");
  await page.getByRole("button", { name: "Afternoon" }).click();
  await expect(page.getByText(/Uses 0.5 day\(s\)/)).toBeVisible();
  await page.getByRole("button", { name: "Send to IRAS supervisor" }).click();
  await expect(page.getByText(/sent to your IRAS supervisor/)).toBeVisible();

  const mine = page.getByRole("region", { name: "My leave requests" });
  await expect(mine).toContainText("(afternoon)");
  await mine.getByRole("button", { name: "Withdraw request" }).first().click();
  await mine.getByRole("button", { name: "Confirm" }).click();
  await expect(mine.getByText("Withdrawn")).toBeVisible();
});

test("medical leave: certificate uploaded by the requester, opened and approved by the supervisor", async ({ page }) => {
  await signIn(page, "Personnel 01");
  await page.getByLabel("Type").selectOption("MEDICAL");
  await page.getByLabel("From", { exact: true }).fill("2026-09-28");
  await page.getByLabel("To", { exact: true }).fill("2026-09-28");
  await page.getByRole("button", { name: "Send to IRAS supervisor" }).click();
  await expect(page.getByText(/Upload your medical certificate/)).toBeVisible();

  const mine = page.getByRole("region", { name: "My leave requests" });
  await expect(mine.getByText("Medical certificate needed")).toBeVisible();
  await mine.getByLabel("Upload document").first().setInputFiles({ name: "evil.html", mimeType: "application/pdf", buffer: Buffer.from("<html>not a pdf") });
  await expect(mine.getByRole("alert")).toContainText("Upload a PDF, JPEG or PNG file.");
  await mine.getByLabel("Upload document").first().setInputFiles({ name: "MC.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%demo\n") });
  await expect(mine.getByText("Certificate uploaded (1)")).toBeVisible();

  await signIn(page, "IRAS Supervisor (demo)");
  const queue = page.getByRole("region", { name: /Leave awaiting your approval/ });
  const item = queue.getByRole("listitem").filter({ hasText: "Medical leave" });
  const download = page.waitForEvent("download");
  await item.getByRole("link", { name: "MC.pdf" }).click();
  expect((await download).suggestedFilename()).toBe("MC.pdf");
  await item.getByRole("button", { name: "Approve" }).click();
  await expect(queue.getByRole("listitem").filter({ hasText: "Medical leave" })).toHaveCount(0);
});

test("administrator sets a person's entitlement and it shows in their balance", async ({ page }) => {
  await signIn(page, "System Administrator (demo)");
  const row = page.getByRole("region", { name: /^Users/ }).getByRole("listitem").filter({ hasText: "u-sp04" });
  await row.getByRole("button", { name: "Edit Personnel 04" }).click();
  await row.getByLabel(/^Annual/).fill("20.5");
  await row.getByRole("button", { name: "Save entitlements" }).click();
  await expect(row.getByText("Entitlements saved.")).toBeVisible();

  await signIn(page, "Personnel 04");
  const bal = page.getByRole("region", { name: /Leave balance 2026/ }).getByRole("row").filter({ hasText: "Annual leave" });
  await expect(bal).toContainText("20.5");
});
