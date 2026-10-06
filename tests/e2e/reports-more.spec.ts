import { expect, test } from "@playwright/test";
import { reseed, signIn } from "./helpers";

test.beforeEach(async () => { await reseed(); });

test("PMO exports, prints and records the invoice for an accepted month", async ({ page }) => {
  await signIn(page, "Accenture PMO (demo)");
  await page.goto("/reports?month=2026-08");

  const xlsx = page.waitForEvent("download");
  await page.getByRole("link", { name: "Excel" }).click();
  const file = await xlsx;
  expect(file.suggestedFilename()).toBe("lemans-report-2026-08.xlsx");
  const bytes = await (await import("node:fs/promises")).readFile(await file.path());
  expect(bytes.subarray(0, 2).toString()).toBe("PK"); // an XLSX file is a zip archive

  await page.getByLabel("Invoice number").fill("INV 1");
  await page.getByRole("button", { name: "Record invoice" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Invoice number");
  await page.getByLabel("Invoice number").fill("INV-2026-08");
  await page.getByRole("button", { name: "Record invoice" }).click();
  await expect(page.getByText(/Invoice INV-2026-08 raised by Accenture PMO/)).toBeVisible();

  await page.getByRole("link", { name: "Print / PDF" }).click();
  await expect(page.getByRole("heading", { name: "Monthly report: August 2026" })).toBeVisible();
  await expect(page.getByText("For the Authority (IRAS): name, signature and date")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();
});

test("auditors can export the ledger and download a digest", async ({ page }) => {
  await signIn(page, "IRAS Supervisor (demo)");
  await page.goto("/audit");
  const exp = page.getByRole("region", { name: "Export for auditors" });
  await exp.getByLabel("From", { exact: true }).fill("2026-09-01");
  await exp.getByLabel("To", { exact: true }).fill("2026-09-30");
  const csv = page.waitForEvent("download");
  await exp.getByRole("button", { name: "Download CSV" }).click();
  expect((await csv).suggestedFilename()).toBe("lemans-ledger-2026-09-01-to-2026-09-30.csv");
  const digest = page.waitForEvent("download");
  await page.getByRole("link", { name: /digest/ }).click();
  expect((await digest).suggestedFilename()).toMatch(/^lemans-ledger-digest-\d{4}-\d{2}-\d{2}\.json$/);
});
