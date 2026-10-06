import "server-only";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool, withTx } from "../db";
import { now } from "../clock";
import { appendLedger } from "../ledger";
import { isIsoDate, monthBounds, type IsoDate } from "../domain/calendar";
import { conflict, notFound, rejected } from "../errors";
import type { CurrentUser, Role } from "../auth/session";

/**
 * User administration. Sign-in itself is WOG SSO; this controls who may sign in, as what, and -
 * for service personnel - over which assignment period their days count. Accounts are never
 * deleted: history must stay attributable to the person who made it.
 */

const USER_LOCK = 72026004;
const ROLES = ["PERSONNEL", "SUPERVISOR", "PMO", "ADMIN"] as const;
const isoDate = z.string().refine(isIsoDate, "Dates must be valid (YYYY-MM-DD).");

export const createUserInput = z.object({
  id: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/, "Login ID must be 3-64 characters: letters, digits, dot, dash or underscore."),
  displayName: z.string().trim().min(2, "Enter a name.").max(100),
  role: z.enum(ROLES),
  roleTitle: z.string().trim().min(2).max(60).optional(),
  startDate: isoDate.optional(),
}).refine((v) => v.role !== "PERSONNEL" || (v.roleTitle && v.startDate), "Service personnel need a job title and an assignment start date.");

export const updateUserInput = z.object({
  displayName: z.string().trim().min(2).max(100).optional(),
  role: z.enum(ROLES).optional(),
  roleTitle: z.string().trim().min(2).max(60).optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.nullable().optional(),
}).refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change.");

export const deactivateInput = z.object({ lastDay: isoDate.optional() });

export interface UserView {
  id: string; displayName: string; role: Role; active: boolean; createdAt: string;
  personnelId: string | null; roleTitle: string | null; startDate: IsoDate | null; endDate: IsoDate | null;
}

const USER_SELECT = `
  SELECT u.id, u.display_name, u.role, u.active, u.created_at, u.personnel_id, p.role_title, p.start_date, p.end_date
  FROM app_user u LEFT JOIN personnel p ON p.id = u.personnel_id`;
const mapUser = (r: Record<string, unknown>): UserView => ({
  id: r.id as string, displayName: r.display_name as string, role: r.role as Role, active: r.active as boolean,
  createdAt: (r.created_at as Date).toISOString(), personnelId: (r.personnel_id as string) ?? null,
  roleTitle: (r.role_title as string) ?? null, startDate: (r.start_date as string) ?? null, endDate: (r.end_date as string) ?? null,
});

export async function listUsers(): Promise<UserView[]> {
  const r = await pool().query(`${USER_SELECT} ORDER BY u.active DESC, u.role, u.display_name LIMIT 1000`);
  return r.rows.map(mapUser);
}

async function loadForUpdate(tx: PoolClient, id: string): Promise<UserView> {
  const r = await tx.query(`${USER_SELECT} WHERE u.id = $1 FOR UPDATE OF u`, [id]);
  if (!r.rows[0]) throw notFound("User");
  return mapUser(r.rows[0]);
}

async function activeAdmins(tx: PoolClient): Promise<number> {
  return (await tx.query("SELECT count(*)::int AS n FROM app_user WHERE role = 'ADMIN' AND active")).rows[0].n;
}

/** The last day of the latest accepted month: assignment changes may not reach back past it. */
async function closedUntil(tx: PoolClient): Promise<IsoDate | null> {
  const r = await tx.query("SELECT max(report_month) AS m FROM monthly_report");
  return r.rows[0].m ? monthBounds(r.rows[0].m.trim()).last : null;
}

/** Refuses a period that would orphan recorded attendance or leave, or rewrite an accepted month. */
async function assertPeriodValid(tx: PoolClient, personnelId: string, start: IsoDate, end: IsoDate | null, before: { start: IsoDate; end: IsoDate | null }) {
  if (end !== null && end < start) throw rejected("BAD_PERIOD", "The end date must be on or after the start date.");
  const closed = await closedUntil(tx);
  if (closed !== null) {
    // A boundary may move only if both its old and new positions are after the last accepted day.
    const OPEN = "9999-12-31";
    if (start !== before.start && (start <= closed || before.start <= closed)) {
      throw rejected("MONTH_CLOSED", "The start date cannot move within or into a month whose report is already accepted.");
    }
    if (end !== before.end && ((end ?? OPEN) <= closed || (before.end ?? OPEN) <= closed)) {
      throw rejected("MONTH_CLOSED", "The end date cannot move within or into a month whose report is already accepted.");
    }
  }
  const outside = await tx.query(
    `SELECT 'attendance' AS kind, min(work_date)::text AS d FROM attendance WHERE personnel_id = $1 AND (work_date < $2 OR ($3::date IS NOT NULL AND work_date > $3))
     UNION ALL
     SELECT 'leave', min(start_date)::text FROM leave_request WHERE personnel_id = $1 AND status IN ('PENDING', 'APPROVED')
       AND (start_date < $2 OR ($3::date IS NOT NULL AND end_date > $3))`,
    [personnelId, start, end]);
  const hit = outside.rows.find((r) => r.d !== null);
  if (hit) throw rejected("PERIOD_HAS_RECORDS", `There is ${hit.kind} recorded on ${hit.d}, outside the new assignment period.`);
}

export async function createUser(admin: CurrentUser, input: z.infer<typeof createUserInput>) {
  return withTx(async (tx) => {
    const n = await now(tx);
    await tx.query("SELECT pg_advisory_xact_lock($1)", [USER_LOCK]);
    if ((await tx.query("SELECT 1 FROM app_user WHERE id = $1", [input.id])).rowCount) {
      throw conflict("LOGIN_TAKEN", "That login ID is already in use. Deactivated accounts keep their ID.");
    }
    let personnelId: string | null = null;
    if (input.role === "PERSONNEL") {
      const max = await tx.query("SELECT coalesce(max(substring(id from 3)::int), 0) AS n FROM personnel WHERE id ~ '^SP[0-9]+$'");
      personnelId = `SP${String(Number(max.rows[0].n) + 1).padStart(2, "0")}`;
      await tx.query(
        "INSERT INTO personnel (id, display_name, role_title, start_date) VALUES ($1, $2, $3, $4)",
        [personnelId, input.displayName, input.roleTitle, input.startDate]);
    }
    await tx.query(
      "INSERT INTO app_user (id, display_name, role, personnel_id, created_at) VALUES ($1, $2, $3, $4, $5)",
      [input.id, input.displayName, input.role, personnelId, n.instant]);
    // The ledger records identifiers and roles, not names: names are personal data and can change.
    await appendLedger(tx, {
      actorId: admin.id, eventType: "USER_CREATED", occurredAt: n.instant,
      payload: { userId: input.id, role: input.role, personnelId, startDate: input.startDate ?? null },
    });
    return { id: input.id, personnelId };
  });
}

export async function updateUser(admin: CurrentUser, id: string, input: z.infer<typeof updateUserInput>) {
  return withTx(async (tx) => {
    const n = await now(tx);
    await tx.query("SELECT pg_advisory_xact_lock($1)", [USER_LOCK]);
    const u = await loadForUpdate(tx, id);
    const changes: Record<string, unknown> = {};

    if (input.role && input.role !== u.role) {
      if (id === admin.id) throw rejected("SELF_CHANGE", "You cannot change your own role.");
      if ((input.role === "PERSONNEL") !== (u.role === "PERSONNEL")) {
        throw rejected("ROLE_CHANGE_NOT_ALLOWED", "Service personnel accounts cannot become staff accounts, or the reverse. Create a separate account.");
      }
      if (u.role === "ADMIN" && u.active && (await activeAdmins(tx)) <= 1) throw rejected("LAST_ADMIN", "At least one active administrator is required.");
      await tx.query("UPDATE app_user SET role = $2 WHERE id = $1", [id, input.role]);
      changes.role = { from: u.role, to: input.role };
    }
    if (input.displayName && input.displayName !== u.displayName) {
      await tx.query("UPDATE app_user SET display_name = $2 WHERE id = $1", [id, input.displayName]);
      if (u.personnelId) await tx.query("UPDATE personnel SET display_name = $2 WHERE id = $1", [u.personnelId, input.displayName]);
      changes.displayName = true; // the value itself stays out of the ledger
    }
    const periodTouched = input.startDate !== undefined || input.endDate !== undefined || input.roleTitle !== undefined;
    if (periodTouched) {
      if (!u.personnelId) throw rejected("NOT_PERSONNEL", "Job title and assignment dates apply to service personnel only.");
      const start = input.startDate ?? u.startDate!;
      const end = input.endDate === undefined ? u.endDate : input.endDate;
      if (start !== u.startDate || end !== u.endDate) {
        await assertPeriodValid(tx, u.personnelId, start, end, { start: u.startDate!, end: u.endDate });
        await tx.query("UPDATE personnel SET start_date = $2, end_date = $3 WHERE id = $1", [u.personnelId, start, end]);
        changes.period = { from: [u.startDate, u.endDate], to: [start, end] };
      }
      if (input.roleTitle && input.roleTitle !== u.roleTitle) {
        await tx.query("UPDATE personnel SET role_title = $2 WHERE id = $1", [u.personnelId, input.roleTitle]);
        changes.roleTitle = input.roleTitle;
      }
    }
    if (Object.keys(changes).length === 0) return { changed: false };
    await appendLedger(tx, { actorId: admin.id, eventType: "USER_UPDATED", occurredAt: n.instant, payload: { userId: id, ...changes } });
    return { changed: true };
  });
}

/** Ends access immediately. For service personnel, also ends the assignment on the given last day. */
export async function deactivateUser(admin: CurrentUser, id: string, input: z.infer<typeof deactivateInput>) {
  return withTx(async (tx) => {
    const n = await now(tx);
    await tx.query("SELECT pg_advisory_xact_lock($1)", [USER_LOCK]);
    if (id === admin.id) throw rejected("SELF_CHANGE", "You cannot deactivate your own account.");
    const u = await loadForUpdate(tx, id);
    if (!u.active) throw conflict("ALREADY_INACTIVE", "This account is already deactivated.");
    if (u.role === "ADMIN" && (await activeAdmins(tx)) <= 1) throw rejected("LAST_ADMIN", "At least one active administrator is required.");

    let lastDay: IsoDate | null = null;
    if (u.personnelId) {
      lastDay = input.lastDay ?? n.date;
      if (lastDay > n.date) throw rejected("FUTURE_LAST_DAY", "To schedule a future leaving date, edit the end date instead; deactivate on or after the last day.");
      const newEnd = u.endDate !== null && u.endDate < lastDay ? u.endDate : lastDay;
      if (newEnd !== u.endDate) {
        await assertPeriodValid(tx, u.personnelId, u.startDate!, newEnd, { start: u.startDate!, end: u.endDate });
        await tx.query("UPDATE personnel SET end_date = $2 WHERE id = $1", [u.personnelId, newEnd]);
      }
      lastDay = newEnd;
    }
    await tx.query("UPDATE app_user SET active = false WHERE id = $1", [id]);
    await appendLedger(tx, { actorId: admin.id, eventType: "USER_DEACTIVATED", occurredAt: n.instant, payload: { userId: id, lastDay } });
    return { lastDay };
  });
}

export async function reactivateUser(admin: CurrentUser, id: string) {
  return withTx(async (tx) => {
    const n = await now(tx);
    await tx.query("SELECT pg_advisory_xact_lock($1)", [USER_LOCK]);
    const u = await loadForUpdate(tx, id);
    if (u.active) throw conflict("ALREADY_ACTIVE", "This account is already active.");
    // A finished assignment is not reopened: the days in between would turn into false gaps.
    if (u.personnelId && u.endDate !== null && u.endDate < n.date) {
      throw rejected("ASSIGNMENT_ENDED", `This assignment ended on ${u.endDate}. Create a new account for a new assignment.`);
    }
    await tx.query("UPDATE app_user SET active = true WHERE id = $1", [id]);
    await appendLedger(tx, { actorId: admin.id, eventType: "USER_REACTIVATED", occurredAt: n.instant, payload: { userId: id } });
  });
}
