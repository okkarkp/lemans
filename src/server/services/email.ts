import "server-only";
import nodemailer from "nodemailer";
import { pool } from "../db";
import { config } from "../config";

export interface MailTransport { send(m: { to: string; subject: string; text: string }): Promise<void> }

const MAX_ATTEMPTS = 5;

/** "log" records that a message would have been sent (no content is logged); "smtp" sends it. */
export function transportFromConfig(): MailTransport | null {
  const c = config();
  if (c.EMAIL_TRANSPORT === "log") return null;
  if (!c.SMTP_URL) throw new Error("EMAIL_TRANSPORT=smtp needs SMTP_URL");
  const u = new URL(c.SMTP_URL);
  const t = nodemailer.createTransport({
    host: u.hostname, port: Number(u.port) || (u.protocol === "smtps:" ? 465 : 587), secure: u.protocol === "smtps:",
    auth: u.username ? { user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password) } : undefined,
    requireTLS: u.protocol !== "smtps:", connectionTimeout: 10_000, socketTimeout: 20_000,
  });
  return { send: async (m) => { await t.sendMail({ from: c.EMAIL_FROM, to: m.to, subject: m.subject, text: m.text }); } };
}

/**
 * Sends due outbox messages. Rows are claimed with SKIP LOCKED so two runners never send the same
 * message; failures back off exponentially and stop after five attempts.
 */
export async function dispatchEmails(transport: MailTransport | null = transportFromConfig(), limit = 50) {
  const client = await pool().connect();
  const result = { sent: 0, logged: 0, failed: 0, retrying: 0 };
  try {
    await client.query("BEGIN");
    const due = (await client.query(
      "SELECT id, to_address, subject, body, attempts FROM email_outbox WHERE status = 'PENDING' AND next_attempt_at <= now() ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED",
      [limit])).rows;
    for (const m of due) {
      if (!transport) {
        await client.query("UPDATE email_outbox SET status = 'LOGGED', sent_at = now() WHERE id = $1", [m.id]);
        result.logged++;
        continue;
      }
      try {
        await transport.send({ to: m.to_address, subject: m.subject, text: m.body });
        await client.query("UPDATE email_outbox SET status = 'SENT', sent_at = now(), attempts = attempts + 1 WHERE id = $1", [m.id]);
        result.sent++;
      } catch (err) {
        const attempts = m.attempts + 1;
        const giveUp = attempts >= MAX_ATTEMPTS;
        // Keep the error class and message only; never the recipient or the message body.
        await client.query(
          `UPDATE email_outbox SET attempts = $2, last_error = $3, status = $4,
             next_attempt_at = now() + make_interval(mins => $5) WHERE id = $1`,
          [m.id, attempts, (err instanceof Error ? err.message : String(err)).slice(0, 300), giveUp ? "FAILED" : "PENDING", 2 ** attempts]);
        if (giveUp) result.failed++; else result.retrying++;
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return result;
}
