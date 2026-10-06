import { defineConfig } from "@playwright/test";
import { testDatabaseUrl } from "./tests/support/test-db";

const DB = testDatabaseUrl();
const SECRET = "test-only-session-key-not-used-for-anything-real";
const common = { DATABASE_URL: DB, SESSION_SECRET: SECRET, COVERAGE_FLOOR: "0.8", ATTENDANCE_FLOOR: "0.85", MISSING_CHECKIN_ALERT_TIME: "12:00", OFFICE_CIDRS: "10.0.0.0/8" };

// Runs against the production build (`next start`), serially, on a dedicated test database.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  globalSetup: "./tests/support/e2e-global-setup.ts",
  use: { baseURL: "http://localhost:3200", channel: "chrome", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: [
    { command: "npx next start -p 3200", port: 3200, reuseExistingServer: false, env: { ...common, DEMO_MODE: "true" }, timeout: 60_000 },
    { command: "npx next start -p 3201", port: 3201, reuseExistingServer: false, env: { ...common, DEMO_MODE: "false" }, timeout: 60_000 },
  ],
});
