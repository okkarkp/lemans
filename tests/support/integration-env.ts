import { afterAll } from "vitest";
import { testDatabaseUrl } from "./test-db";

process.env.DATABASE_URL = testDatabaseUrl();
process.env.DEMO_MODE = "true";
process.env.SESSION_SECRET = "test-only-session-key-not-used-for-anything-real";
process.env.COVERAGE_FLOOR = "0.8";
process.env.MISSING_CHECKIN_ALERT_TIME = "12:00";

afterAll(async () => {
  const g = globalThis as unknown as { lemansPool?: { end(): Promise<void> } };
  await g.lemansPool?.end();
  g.lemansPool = undefined;
});
