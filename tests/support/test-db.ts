import { existsSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { ensureAppRole, runMigrations } from "../../scripts/lib/migrations";
import { seedDatabase } from "../../scripts/lib/seed-data";

export const TEST_DB = "lemans_test";

/** The test database lives in the same local PostgreSQL as the demo, under its own name. */
export const TEST_APP_USER = "lemans_app";
const TEST_APP_PASSWORD = "test-only-app-role-password";

/** Owner connection to the test database: migrations and seeding only. */
export function testDatabaseUrl(): string {
  const envFile = path.join(__dirname, "..", "..", ".env.local");
  if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
  const base = process.env.LEMANS_BASE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is not set. Run npm run setup first.");
  process.env.LEMANS_BASE_DATABASE_URL = base;
  const url = new URL(base);
  url.pathname = `/${TEST_DB}`;
  return url.toString();
}

/** Restricted application connection: what the code under test uses, as in production. */
export function testAppDatabaseUrl(): string {
  const url = new URL(testDatabaseUrl());
  url.username = TEST_APP_USER;
  url.password = TEST_APP_PASSWORD;
  return url.toString();
}

export async function prepareTestDatabase(): Promise<string> {
  const url = testDatabaseUrl();
  const admin = new Client({ connectionString: process.env.LEMANS_BASE_DATABASE_URL });
  await admin.connect();
  try {
    const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [TEST_DB]);
    if (!exists.rowCount) await admin.query(`CREATE DATABASE ${TEST_DB}`);
  } finally {
    await admin.end();
  }
  await withClient(url, async (c) => {
    await runMigrations(c, { reset: true });
    await ensureAppRole(c, TEST_APP_USER, TEST_APP_PASSWORD);
    await seedDatabase(c);
  });
  return url;
}

export async function reseed(url = testDatabaseUrl()): Promise<void> {
  await withClient(url, async (c) => { await seedDatabase(c); });
}

export async function withClient<T>(url: string, fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: url });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}
