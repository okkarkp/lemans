import { expect, test } from "@playwright/test";
import { apiPost, reseed, setBusinessDate, signIn } from "./helpers";

test.beforeEach(async () => { await reseed(); });

test("supervisor must give a reason to reject, and can approve", async ({ page }) => {
  await signIn(page, "IRAS Supervisor (demo)");
  const queue = page.getByRole("region", { name: /Leave awaiting your approval/ });
  await expect(queue).toContainText("Personnel 05");
  await expect(queue).toContainText("Childcare leave");

  await queue.getByRole("button", { name: "Reject" }).click();
  const confirm = queue.getByRole("button", { name: "Confirm rejection" });
  await expect(confirm).toBeDisabled();
  await queue.getByLabel("Reason for rejecting").fill("No");
  await expect(confirm).toBeDisabled();
  await queue.getByRole("button", { name: "Cancel" }).click();

  await queue.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Nothing waiting for approval.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Who is working today" })).toContainText("Personnel 01");
});

test("PMO follows up missing check-ins and closes a gap with a reason", async ({ page }) => {
  await signIn(page, "Accenture PMO (demo)");
  const midday = page.getByRole("region", { name: "Midday check" });
  await expect(midday).toContainText("12:00 alert - 2 not checked in");

  const row = midday.getByRole("listitem").filter({ hasText: "Personnel 06" });
  await row.getByRole("button", { name: "Follow up" }).click();
  await expect(row.getByText("Followed up")).toBeVisible();

  const gaps = page.getByRole("region", { name: /Unexplained gaps this month/ });
  await gaps.getByRole("button", { name: "Record leave" }).click();
  await gaps.getByLabel(/Reason for recording as leave/).fill("MC");
  await gaps.getByRole("button", { name: "Save correction" }).click();
  await expect(gaps.getByRole("alert")).toContainText("at least 5 characters");
  await gaps.getByLabel(/Reason for recording as leave/).fill("Medical certificate received late");
  await gaps.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByText("No gaps. Every past working day is worked or accounted for.")).toBeVisible();
});

test("month end: gaps block acceptance; once resolved, IRAS accepts and the figures freeze", async ({ page }) => {
  await signIn(page, "Accenture PMO (demo)");
  await setBusinessDate(page, "2026-10-01");

  await page.goto("/reports?month=2026-09");
  await expect(page.getByText(/Resolve \d+ gap\(s\) before IRAS can accept/)).toBeVisible();

  // Close every remaining September gap through the real API (the UI path is covered above).
  const ids = ["SP01", "SP02", "SP03", "SP04", "SP05", "SP06"];
  for (let d = 1; d <= 30; d++) {
    const date = `2026-09-${String(d).padStart(2, "0")}`;
    if ([0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay())) continue;
    for (const p of ids) {
      const r = await apiPost(page, "/api/pmo/corrections", { personnelId: p, workDate: date, outcome: "LEAVE", reason: "Leave confirmed by team lead" });
      expect([201, 422]).toContain(r.status());
    }
  }

  await signIn(page, "IRAS Supervisor (demo)");
  await page.goto("/reports?month=2026-09");
  await expect(page.getByText("September 2026 - final draft")).toBeVisible();
  await page.getByRole("button", { name: "Accept report" }).click();
  await page.getByRole("button", { name: "Confirm acceptance" }).click();
  await expect(page.getByText(/Accepted by IRAS Supervisor \(demo\)/)).toBeVisible();
  await expect(page.getByText("September 2026 - accepted")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV" }).click();
  const csv = await (await download).createReadStream();
  const text = await new Promise<string>((res) => { let s = ""; csv.on("data", (c) => (s += c)); csv.on("end", () => res(s)); });
  expect(text).toContain("Service personnel,Worked,Corrected to worked,Leave,Gaps,Billable");
  expect(text).toContain("Accepted by IRAS Supervisor (demo)");

  const again = await apiPost(page, "/api/reports/2026-09/accept", {});
  expect(again.status()).toBe(409);

  await page.goto("/audit");
  await expect(page.getByText(/Chain verified\./)).toBeVisible();
  await expect(page.getByRole("cell", { name: "Report accepted" }).first()).toBeVisible();
});
