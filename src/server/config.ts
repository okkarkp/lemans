import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  DEMO_MODE: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  OFFICE_CIDRS: z.string().default(""),
  COVERAGE_FLOOR: z.coerce.number().min(0).max(1).default(0.8),
  ATTENDANCE_FLOOR: z.coerce.number().min(0).max(1).default(0.85),
  MISSING_CHECKIN_ALERT_TIME: z.string().regex(/^\d{2}:\d{2}$/).default("12:00"),
  CHECKIN_REMINDER_TIME: z.string().regex(/^\d{2}:\d{2}$/).default("11:00"),
  APPROVAL_REMINDER_AFTER_DAYS: z.coerce.number().int().min(1).max(30).default(2),
  // Shared secret for the local job trigger. When unset the trigger is disabled.
  JOBS_TOKEN: z.string().min(32).optional(),
  EMAIL_TRANSPORT: z.enum(["log", "smtp"]).default("log"),
  SMTP_URL: z.string().url().optional(),
  EMAIL_FROM: z.string().default("LeMans 2.0 <no-reply@lemans.invalid>"),
  APP_BASE_URL: z.string().url().default("http://localhost:3100"),
});

export type AppConfig = z.infer<typeof schema>;

/** Read and validate configuration at the point of use, so a bad deploy fails loudly. */
export function config(): AppConfig {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration - ${fields}`);
  }
  return parsed.data;
}

export const splitList = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);
