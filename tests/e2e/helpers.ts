import { expect, type Page } from "@playwright/test";
import { reseed } from "../support/test-db";

export const BASE = "http://localhost:3200";
export { reseed };

export async function signIn(page: Page, name: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Identity").selectOption({ label: name });
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
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
