import { afterEach, describe, expect, it } from "vitest";
import { config } from "@/server/config";

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });
const base = { DATABASE_URL: "postgres://u:p@localhost:5432/db", SESSION_SECRET: "x".repeat(40) };

describe("config", () => {
  it("treats empty variables as unset, so optional settings and defaults still apply", () => {
    process.env = { ...base, SMTP_URL: "", JOBS_TOKEN: "", COVERAGE_FLOOR: "", EMAIL_TRANSPORT: "" } as unknown as NodeJS.ProcessEnv;
    const c = config();
    expect(c.SMTP_URL).toBeUndefined();
    expect(c.JOBS_TOKEN).toBeUndefined();
    expect(c.COVERAGE_FLOOR).toBe(0.8);
    expect(c.EMAIL_TRANSPORT).toBe("log");
  });
  it("still rejects invalid values and a short session secret", () => {
    process.env = { ...base, SMTP_URL: "not a url" } as unknown as NodeJS.ProcessEnv;
    expect(() => config()).toThrow(/SMTP_URL/);
    process.env = { ...base, SESSION_SECRET: "short" } as unknown as NodeJS.ProcessEnv;
    expect(() => config()).toThrow(/SESSION_SECRET/);
  });
});
