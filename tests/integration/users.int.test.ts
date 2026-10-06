import { beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/server/db";
import { verifyLedger } from "@/server/services/audit";
import { coverageFor, submitLeave } from "@/server/services/leave";
import { listPersonnel } from "@/server/services/reference";
import { getReport } from "@/server/services/report";
import { createUser, createUserInput, deactivateUser, reactivateUser, updateUser, updateUserInput } from "@/server/services/users";
import type { CurrentUser } from "@/server/auth/session";
import { reseed } from "../support/test-db";
import { personnel, race, setClock } from "../support/fixtures";

const admin: CurrentUser = { id: "u-admin01", displayName: "System Administrator (demo)", role: "ADMIN", personnelId: null };
const isActive = async (id: string) => (await pool().query("SELECT active FROM app_user WHERE id = $1", [id])).rows[0].active as boolean;

describe("user management", () => {
  beforeEach(() => reseed());

  it("creates service personnel with the next SP number and an assignment period, without names in the ledger", async () => {
    const r = await createUser(admin, { id: "new.dev", displayName: "Personnel 07", role: "PERSONNEL", roleTitle: "Developer", startDate: "2026-09-21", teamId: "APP" });
    expect(r).toEqual({ id: "new.dev", personnelId: "SP07" });
    expect((await listPersonnel(pool(), "2026-09-21")).map((p) => p.id)).toContain("SP07");
    expect((await listPersonnel(pool(), "2026-09-18")).map((p) => p.id)).not.toContain("SP07");
    const e = (await pool().query("SELECT payload FROM ledger_entry WHERE event_type = 'USER_CREATED'")).rows[0].payload;
    expect(e).toMatchObject({ userId: "new.dev", role: "PERSONNEL", personnelId: "SP07" });
    expect(JSON.stringify(e)).not.toContain("Personnel 07");
  });

  it("validates input and refuses a login ID that is taken", async () => {
    expect(createUserInput.safeParse({ id: "x", displayName: "Someone", role: "PMO" }).success).toBe(false);
    expect(createUserInput.safeParse({ id: "Bad ID!", displayName: "Someone", role: "PMO" }).success).toBe(false);
    expect(createUserInput.safeParse({ id: "pers.one", displayName: "Someone", role: "PERSONNEL" }).success).toBe(false);
    expect(createUserInput.parse({ id: "  New.PMO ", displayName: "Someone", role: "PMO" }).id).toBe("new.pmo");
    expect(updateUserInput.safeParse({}).success).toBe(false);
    await expect(createUser(admin, { id: "u-sp01", displayName: "Dup", role: "PMO" })).rejects.toMatchObject({ code: "LOGIN_TAKEN" });
  });

  it("guards role changes", async () => {
    await createUser(admin, { id: "second.pmo", displayName: "Second PMO", role: "PMO" });
    expect(await updateUser(admin, "second.pmo", { role: "SUPERVISOR" })).toEqual({ changed: true });
    await expect(updateUser(admin, "u-sp01", { role: "PMO" })).rejects.toMatchObject({ code: "ROLE_CHANGE_NOT_ALLOWED" });
    await expect(updateUser(admin, "u-pmo01", { role: "PERSONNEL" })).rejects.toMatchObject({ code: "ROLE_CHANGE_NOT_ALLOWED" });
    await expect(updateUser(admin, "u-admin01", { role: "PMO" })).rejects.toMatchObject({ code: "SELF_CHANGE" });
    await expect(updateUser(admin, "u-pmo01", { startDate: "2026-01-01" })).rejects.toMatchObject({ code: "NOT_PERSONNEL" });
    await expect(updateUser(admin, "nobody", { displayName: "X Y" })).rejects.toMatchObject({ status: 404 });
  });

  it("never leaves the system without an administrator, even under a race", async () => {
    await expect(deactivateUser(admin, "u-admin01", {})).rejects.toMatchObject({ code: "SELF_CHANGE" });
    const two: CurrentUser = { id: "u-admin02", displayName: "System Administrator 2 (demo)", role: "ADMIN", personnelId: null };
    const res = await race([() => deactivateUser(admin, "u-admin02", {}), () => deactivateUser(two, "u-admin01", {})]);
    expect(res.ok).toHaveLength(1);
    expect(res.failed[0]).toMatchObject({ code: "LAST_ADMIN" });
    expect((await pool().query("SELECT count(*)::int AS n FROM app_user WHERE role = 'ADMIN' AND active")).rows[0].n).toBe(1);
  });

  it("deactivates personnel on a last day that leaves no records orphaned", async () => {
    await expect(deactivateUser(admin, "u-sp04", { lastDay: "2026-09-15" })).rejects.toMatchObject({ code: "PERIOD_HAS_RECORDS" });
    await expect(deactivateUser(admin, "u-sp06", { lastDay: "2026-09-30" })).rejects.toMatchObject({ code: "FUTURE_LAST_DAY" });
    expect(await deactivateUser(admin, "u-sp06", {})).toEqual({ lastDay: "2026-09-22" });
    expect(await isActive("u-sp06")).toBe(false);
    await expect(deactivateUser(admin, "u-sp06", {})).rejects.toMatchObject({ code: "ALREADY_INACTIVE" });

    await setClock("2026-10-01T09:00");
    const sep = await getReport("2026-09");
    expect(sep.report.rows.find((r) => r.personnelId === "SP06")?.assignedDays).toBe(16);
    expect(sep.report.capacity).toBe(5 * 22 + 16);
  });

  it("refuses to cut an assignment short of pending leave, or to move it into an accepted month", async () => {
    await expect(updateUser(admin, "u-sp05", { endDate: "2026-09-25" })).rejects.toMatchObject({ code: "PERIOD_HAS_RECORDS" });
    await expect(updateUser(admin, "u-sp01", { startDate: "2026-08-03" })).rejects.toMatchObject({ code: "MONTH_CLOSED" });
    await expect(updateUser(admin, "u-sp01", { endDate: "2026-08-28" })).rejects.toMatchObject({ code: "MONTH_CLOSED" });
    await expect(updateUser(admin, "u-sp01", { endDate: "2026-09-01" })).rejects.toMatchObject({ code: "PERIOD_HAS_RECORDS" });
  });

  it("a scheduled end date shrinks the team for coverage and blocks leave beyond it", async () => {
    expect(await updateUser(admin, "u-sp01", { endDate: "2026-09-25" })).toEqual({ changed: true });
    const cov = await coverageFor(pool(), "SP02", "2026-09-28", "2026-09-28");
    expect(cov.minRatio).toBeCloseTo(4 / 5);
    await expect(submitLeave(personnel(1), { leaveType: "ANNUAL", startDate: "2026-09-28", endDate: "2026-09-28", backupPersonnelId: "SP02" }))
      .rejects.toMatchObject({ code: "OUTSIDE_ASSIGNMENT" });
    await expect(submitLeave(personnel(2), { leaveType: "ANNUAL", startDate: "2026-09-28", endDate: "2026-09-28", backupPersonnelId: "SP01" }))
      .rejects.toMatchObject({ code: "BACKUP_UNKNOWN" });
  });

  it("reactivates only while the assignment is still running", async () => {
    await deactivateUser(admin, "u-sp06", {});
    await reactivateUser(admin, "u-sp06");
    expect(await isActive("u-sp06")).toBe(true);
    await expect(reactivateUser(admin, "u-sp06")).rejects.toMatchObject({ code: "ALREADY_ACTIVE" });
    await deactivateUser(admin, "u-sp06", {});
    await setClock("2026-09-23T09:00");
    await expect(reactivateUser(admin, "u-sp06")).rejects.toMatchObject({ code: "ASSIGNMENT_ENDED" });
    expect((await verifyLedger()).ok).toBe(true);
  });
});
