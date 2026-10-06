import "server-only";
import { z } from "zod";
import { pool, withTx, type Db } from "../db";
import { now } from "../clock";
import { appendLedger } from "../ledger";
import { addDays, isIsoDate, type IsoDate } from "../domain/calendar";
import { badRequest, conflict, forbidden, notFound, rejected } from "../errors";
import type { CurrentUser } from "../auth/session";
import { notify } from "./notify";

const MAX_DELEGATION_DAYS = 90;
const isoDate = z.string().refine(isIsoDate, "Dates must be valid (YYYY-MM-DD).");

export const teamInput = z.object({
  id: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/, "Team code: 2-20 letters, digits or dashes."),
  name: z.string().trim().min(2).max(80),
  supervisorId: z.string().min(1).nullable(),
});
export const teamUpdateInput = teamInput.omit({ id: true }).partial().refine((v) => Object.keys(v).length > 0, "Nothing to change.");
export const delegationInput = z.object({
  delegatorId: z.string().min(1).optional(),
  delegateId: z.string().min(1),
  startDate: isoDate,
  endDate: isoDate,
}).refine((v) => v.endDate >= v.startDate, "End date must be on or after the start date.");

export interface TeamView { id: string; name: string; supervisorId: string | null; supervisorName: string | null; members: number }

export async function listTeams(db: Db = pool()): Promise<TeamView[]> {
  const day = (await now(db)).date;
  const r = await db.query(
    `SELECT t.id, t.name, t.supervisor_id, u.display_name AS supervisor_name,
            (SELECT count(*)::int FROM personnel p WHERE p.team_id = t.id AND p.start_date <= $1 AND (p.end_date IS NULL OR p.end_date >= $1)) AS members
     FROM team t LEFT JOIN app_user u ON u.id = t.supervisor_id ORDER BY t.name`, [day]);
  return r.rows.map((t) => ({ id: t.id, name: t.name, supervisorId: t.supervisor_id, supervisorName: t.supervisor_name, members: t.members }));
}

/**
 * Teams whose leave this user may decide on, on the given day: teams they supervise, teams with no
 * supervisor, and teams of supervisors who have delegated to them for that day.
 */
export async function approvableTeams(db: Db, user: CurrentUser, day: IsoDate): Promise<Set<string>> {
  if (user.role !== "SUPERVISOR") return new Set();
  const r = await db.query(
    `SELECT t.id FROM team t
     WHERE t.supervisor_id = $1 OR t.supervisor_id IS NULL
        OR t.supervisor_id IN (SELECT d.delegator_id FROM delegation d
                               WHERE d.delegate_id = $1 AND d.revoked_at IS NULL AND $2::date BETWEEN d.start_date AND d.end_date)`,
    [user.id, day]);
  return new Set(r.rows.map((x) => x.id as string));
}

async function assertSupervisor(db: Db, id: string | null | undefined, what: string) {
  if (!id) return;
  const r = await db.query("SELECT 1 FROM app_user WHERE id = $1 AND role = 'SUPERVISOR' AND active", [id]);
  if (!r.rowCount) throw badRequest("NOT_A_SUPERVISOR", `${what} must be an active IRAS supervisor.`);
}

export async function createTeam(admin: CurrentUser, input: z.infer<typeof teamInput>) {
  return withTx(async (tx) => {
    const n = await now(tx);
    await assertSupervisor(tx, input.supervisorId, "The supervisor");
    const dup = await tx.query("SELECT 1 FROM team WHERE id = $1 OR lower(name) = lower($2)", [input.id, input.name]);
    if (dup.rowCount) throw conflict("TEAM_EXISTS", "A team with that code or name already exists.");
    await tx.query("INSERT INTO team (id, name, supervisor_id, created_at) VALUES ($1, $2, $3, $4)", [input.id, input.name, input.supervisorId, n.instant]);
    await appendLedger(tx, { actorId: admin.id, eventType: "TEAM_CREATED", occurredAt: n.instant, payload: { teamId: input.id, supervisorId: input.supervisorId } });
    return { id: input.id };
  });
}

export async function updateTeam(admin: CurrentUser, id: string, input: z.infer<typeof teamUpdateInput>) {
  return withTx(async (tx) => {
    const n = await now(tx);
    const t = (await tx.query("SELECT * FROM team WHERE id = $1 FOR UPDATE", [id])).rows[0];
    if (!t) throw notFound("Team");
    if (input.supervisorId !== undefined) await assertSupervisor(tx, input.supervisorId, "The supervisor");
    if (input.name && input.name !== t.name) {
      const dup = await tx.query("SELECT 1 FROM team WHERE lower(name) = lower($1) AND id <> $2", [input.name, id]);
      if (dup.rowCount) throw conflict("TEAM_EXISTS", "Another team already has that name.");
    }
    await tx.query("UPDATE team SET name = coalesce($2, name), supervisor_id = CASE WHEN $4 THEN $3 ELSE supervisor_id END WHERE id = $1",
      [id, input.name ?? null, input.supervisorId ?? null, input.supervisorId !== undefined]);
    await appendLedger(tx, {
      actorId: admin.id, eventType: "TEAM_UPDATED", occurredAt: n.instant,
      payload: { teamId: id, ...(input.supervisorId !== undefined ? { supervisor: { from: t.supervisor_id, to: input.supervisorId } } : {}), ...(input.name ? { renamed: true } : {}) },
    });
  });
}

export interface DelegationView { id: number; delegatorId: string; delegatorName: string; delegateId: string; delegateName: string; startDate: IsoDate; endDate: IsoDate }

/** Active and future delegations involving this user (or all, for an administrator). */
export async function listDelegations(user: CurrentUser): Promise<DelegationView[]> {
  const db = pool();
  const n = await now(db);
  const r = await db.query(
    `SELECT d.id, d.delegator_id, a.display_name AS delegator_name, d.delegate_id, b.display_name AS delegate_name, d.start_date, d.end_date
     FROM delegation d JOIN app_user a ON a.id = d.delegator_id JOIN app_user b ON b.id = d.delegate_id
     WHERE d.revoked_at IS NULL AND d.end_date >= $1 AND ($2::text IS NULL OR $2 IN (d.delegator_id, d.delegate_id))
     ORDER BY d.start_date LIMIT 200`, [n.date, user.role === "ADMIN" ? null : user.id]);
  return r.rows.map((d) => ({ id: Number(d.id), delegatorId: d.delegator_id, delegatorName: d.delegator_name, delegateId: d.delegate_id, delegateName: d.delegate_name, startDate: d.start_date, endDate: d.end_date }));
}

export async function createDelegation(user: CurrentUser, input: z.infer<typeof delegationInput>) {
  // A supervisor delegates their own approvals; an administrator may set one up for anyone.
  const delegatorId = user.role === "ADMIN" ? input.delegatorId : user.id;
  if (user.role === "SUPERVISOR" && input.delegatorId && input.delegatorId !== user.id) throw forbidden();
  if (!delegatorId) throw badRequest("DELEGATOR_REQUIRED", "Choose whose approvals are being delegated.");
  if (delegatorId === input.delegateId) throw badRequest("DELEGATE_SELF", "Choose a different supervisor.");
  return withTx(async (tx) => {
    const n = await now(tx);
    if (input.startDate < n.date) throw rejected("BACKDATED", "A delegation cannot start in the past.");
    if (input.endDate > addDays(input.startDate, MAX_DELEGATION_DAYS - 1)) throw rejected("TOO_LONG", `A delegation can last at most ${MAX_DELEGATION_DAYS} days.`);
    await assertSupervisor(tx, delegatorId, "The person delegating");
    await assertSupervisor(tx, input.delegateId, "The delegate");
    await tx.query("SELECT pg_advisory_xact_lock(72026005)");
    const overlap = await tx.query(
      "SELECT 1 FROM delegation WHERE delegator_id = $1 AND revoked_at IS NULL AND start_date <= $3 AND end_date >= $2",
      [delegatorId, input.startDate, input.endDate]);
    if (overlap.rowCount) throw conflict("OVERLAP", "There is already a delegation covering some of these days.");
    const r = await tx.query<{ id: string }>(
      `INSERT INTO delegation (delegator_id, delegate_id, start_date, end_date, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [delegatorId, input.delegateId, input.startDate, input.endDate, user.id, n.instant]);
    const id = Number(r.rows[0].id);
    await appendLedger(tx, { actorId: user.id, eventType: "DELEGATION_CREATED", occurredAt: n.instant,
      payload: { delegationId: id, delegatorId, delegateId: input.delegateId, startDate: input.startDate, endDate: input.endDate } });
    await notify(tx, [input.delegateId], {
      kind: "DELEGATION_CREATED", title: "You are covering leave approvals",
      body: `You will approve leave on behalf of another supervisor from ${input.startDate} to ${input.endDate}.`, link: "/supervisor",
    }, n.instant);
    return { id };
  });
}

export async function revokeDelegation(user: CurrentUser, id: number) {
  return withTx(async (tx) => {
    const n = await now(tx);
    const d = (await tx.query("SELECT * FROM delegation WHERE id = $1 FOR UPDATE", [id])).rows[0];
    if (!d) throw notFound("Delegation");
    if (user.role !== "ADMIN" && d.delegator_id !== user.id) throw forbidden();
    if (d.revoked_at) throw conflict("ALREADY_REVOKED", "This delegation has already been revoked.");
    await tx.query("UPDATE delegation SET revoked_at = $2, revoked_by = $3 WHERE id = $1", [id, n.instant, user.id]);
    await appendLedger(tx, { actorId: user.id, eventType: "DELEGATION_REVOKED", occurredAt: n.instant, payload: { delegationId: id } });
  });
}
