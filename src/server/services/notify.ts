import "server-only";
import type { PoolClient } from "pg";
import { pool } from "../db";
import { config } from "../config";
import type { IsoDate } from "../domain/calendar";

export interface Message { kind: string; title: string; body: string; link?: string }

/**
 * Writes an in-app notification (and an email to the outbox, when the person has an address)
 * inside the caller's transaction: if the business change rolls back, so does the message.
 * Bodies must not carry medical details or other sensitive data - they may leave by email.
 */
export async function notify(tx: PoolClient, userIds: Iterable<string>, m: Message, at: Date): Promise<number> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return 0;
  const users = (await tx.query("SELECT id, email FROM app_user WHERE id = ANY($1) AND active", [ids])).rows;
  for (const u of users) {
    const n = await tx.query<{ id: string }>(
      "INSERT INTO notification (user_id, kind, title, body, link, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [u.id, m.kind, m.title, m.body, m.link ?? null, at]);
    if (u.email) {
      const link = m.link ? `\n\nOpen LeMans: ${config().APP_BASE_URL}${m.link}` : "";
      await tx.query("INSERT INTO email_outbox (notification_id, to_address, subject, body) VALUES ($1, $2, $3, $4)",
        [n.rows[0].id, u.email, `LeMans: ${m.title}`, `${m.body}${link}\n\nThis is an automated message from LeMans 2.0.`]);
    }
  }
  return users.length;
}

/** Who decides leave for a team on a day: its supervisor and their delegates; any supervisor if it has none. */
export async function approversOf(tx: PoolClient, teamId: string, day: IsoDate): Promise<string[]> {
  const r = await tx.query(
    `SELECT u.id FROM app_user u WHERE u.active AND u.role = 'SUPERVISOR' AND (
       u.id = (SELECT supervisor_id FROM team WHERE id = $1)
       OR (SELECT supervisor_id FROM team WHERE id = $1) IS NULL
       OR u.id IN (SELECT d.delegate_id FROM delegation d JOIN team t ON t.supervisor_id = d.delegator_id
                   WHERE t.id = $1 AND d.revoked_at IS NULL AND $2::date BETWEEN d.start_date AND d.end_date))`,
    [teamId, day]);
  return r.rows.map((x) => x.id);
}

export async function usersWithRole(tx: PoolClient, role: string): Promise<string[]> {
  return (await tx.query("SELECT id FROM app_user WHERE role = $1 AND active", [role])).rows.map((x) => x.id);
}

export async function userOfPersonnel(tx: PoolClient, personnelId: string): Promise<string[]> {
  return (await tx.query("SELECT id FROM app_user WHERE personnel_id = $1", [personnelId])).rows.map((x) => x.id);
}

export interface NotificationView { id: number; kind: string; title: string; body: string; link: string | null; createdAt: string; read: boolean }

export async function listNotifications(userId: string, limit = 50): Promise<NotificationView[]> {
  const r = await pool().query(
    "SELECT id, kind, title, body, link, created_at, read_at FROM notification WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2",
    [userId, limit]);
  return r.rows.map((n) => ({ id: Number(n.id), kind: n.kind, title: n.title, body: n.body, link: n.link, createdAt: (n.created_at as Date).toISOString(), read: n.read_at !== null }));
}

export async function unreadCount(userId: string): Promise<number> {
  return (await pool().query("SELECT count(*)::int AS n FROM notification WHERE user_id = $1 AND read_at IS NULL", [userId])).rows[0].n;
}

/** Marks the user's own notifications read; ids belonging to someone else are ignored. */
export async function markRead(userId: string, ids: number[] | "all"): Promise<number> {
  const r = ids === "all"
    ? await pool().query("UPDATE notification SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [userId])
    : await pool().query("UPDATE notification SET read_at = now() WHERE user_id = $1 AND id = ANY($2) AND read_at IS NULL", [userId, ids]);
  return r.rowCount ?? 0;
}
