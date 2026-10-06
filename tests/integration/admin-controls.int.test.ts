import { beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/server/db";
import { createUser, decideAdminGrant, listPendingGrants, reactivateUser, updateUser } from "@/server/services/users";
import { importUsers } from "@/server/services/user-import";
import { addHoliday, listHolidays, removeHoliday } from "@/server/services/holidays";
import { submitLeave } from "@/server/services/leave";
import type { CurrentUser } from "@/server/auth/session";
import { reseed } from "../support/test-db";
import { personnel, setClock } from "../support/fixtures";

const a1: CurrentUser = { id: "u-admin01", displayName: "A1", role: "ADMIN", personnelId: null };
const a2: CurrentUser = { id: "u-admin02", displayName: "A2", role: "ADMIN", personnelId: null };
const userRow = async (id: string) => (await pool().query("SELECT role, active FROM app_user WHERE id = $1", [id])).rows[0];
const HEADER = "login_id,name,role,email,team,job_title,start_date";

describe("administrator rights need a second administrator", () => {
  beforeEach(() => reseed());

  it("a new administrator stays inactive until another administrator approves", async () => {
    expect(await createUser(a1, { id: "new.admin", displayName: "New Admin", role: "ADMIN" })).toMatchObject({ pendingApproval: true });
    expect(await userRow("new.admin")).toEqual({ role: "ADMIN", active: false });
    await expect(reactivateUser(a1, "new.admin")).rejects.toMatchObject({ code: "PENDING_ADMIN_APPROVAL" });
    const [g] = await listPendingGrants();
    await expect(decideAdminGrant(a1, g.id, true)).rejects.toMatchObject({ code: "SAME_ADMIN" });
    expect(await decideAdminGrant(a2, g.id, true)).toEqual({ status: "APPROVED" });
    expect(await userRow("new.admin")).toEqual({ role: "ADMIN", active: true });
    await expect(decideAdminGrant(a2, g.id, false)).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
  });

  it("a promotion keeps the old role until approved, and a rejection leaves it unchanged", async () => {
    await updateUser(a1, "u-pmo01", { role: "ADMIN" });
    expect((await userRow("u-pmo01")).role).toBe("PMO");
    await expect(updateUser(a1, "u-pmo01", { role: "ADMIN" })).rejects.toMatchObject({ code: "GRANT_PENDING" });
    const [g] = await listPendingGrants();
    await decideAdminGrant(a2, g.id, false);
    expect((await userRow("u-pmo01")).role).toBe("PMO");
    await expect(pool().query("UPDATE admin_grant SET decided_by = requested_by")).rejects.toThrow();
  });
});

describe("bulk user import", () => {
  beforeEach(() => reseed());

  it("checks the whole file without writing anything, then imports all of it", async () => {
    const csv = `${HEADER}\nnew.one,Personnel 07,PERSONNEL,,APP,Developer,2026-10-01\n"new.two","Smith, J",PMO,pmo2@lemans.invalid,,,\n`;
    const dry = await importUsers(a1, csv, true);
    expect(dry.applied).toBe(false);
    expect(dry.rows.map((r) => r.ok)).toEqual([true, true]);
    expect(await userRow("new.one")).toBeUndefined();
    const real = await importUsers(a1, csv, false);
    expect(real.applied).toBe(true);
    expect(real.rows[0].message).toBe("Created as SP07");
    expect((await userRow("new.two")).role).toBe("PMO");
  });

  it("rejects the whole file if any row is wrong, and reports each row", async () => {
    const csv = `${HEADER}\nok.user,Fine,PMO,,,,\nu-sp01,Taken,PMO,,,,\nbad id,X,PMO,,,,\nboss,Boss,ADMIN,,,,\nok.user,Dup,PMO,,,,\nnew.p,P,PERSONNEL,,NOPE,Dev,2026-10-01\n`;
    const r = await importUsers(a1, csv, false);
    expect(r.applied).toBe(false);
    const msg = Object.fromEntries(r.rows.map((x) => [x.line, x.message]));
    expect(msg[4]).toMatch(/Login ID must be/);
    expect(msg[5]).toMatch(/cannot be imported/);
    expect(msg[6]).toMatch(/more than once/);
    expect(await userRow("ok.user")).toBeUndefined();
  });

  it("reports database-level problems in the check, and still writes nothing", async () => {
    const r = await importUsers(a1, `${HEADER}\nfresh.one,Fresh,PMO,,,,\nu-sp01,Taken,PMO,,,,\nnew.p,Pat,PERSONNEL,,NOPE,Dev,2026-10-01\n`, true);
    expect(r.rows.map((x) => x.ok)).toEqual([true, false, false]);
    expect(r.rows[1].message).toMatch(/already in use/);
    expect(r.rows[2].message).toMatch(/existing team/);
    expect(await userRow("fresh.one")).toBeUndefined();
    await expect(importUsers(a1, "login_id,name\nx,y", true)).rejects.toMatchObject({ code: "BAD_HEADER" });
  });
});

describe("public holidays", () => {
  beforeEach(() => reseed());

  it("adds a future holiday that then excludes the day, and removes it", async () => {
    await addHoliday(a1, { date: "2026-09-28", name: "Test holiday" });
    expect((await listHolidays(2026)).map((h) => h.date)).toContain("2026-09-28");
    await expect(submitLeave(personnel(1), { leaveType: "ANNUAL", startDate: "2026-09-28", endDate: "2026-09-28", backupPersonnelId: "SP04" }))
      .rejects.toMatchObject({ code: "NO_WORKING_DAYS" });
    await removeHoliday(a1, "2026-09-28");
    await expect(removeHoliday(a1, "2026-09-28")).rejects.toMatchObject({ status: 404 });
  });

  it("refuses past dates, accepted months, duplicates and days that already have records", async () => {
    await expect(addHoliday(a1, { date: "2026-09-01", name: "Too late" })).rejects.toMatchObject({ code: "PAST_DATE" });
    await expect(removeHoliday(a1, "2026-08-10")).rejects.toMatchObject({ code: "MONTH_CLOSED" });
    await expect(addHoliday(a1, { date: "2026-09-24", name: "Clash" })).rejects.toMatchObject({ code: "HAS_RECORDS" });
    await addHoliday(a1, { date: "2026-12-25", name: "Christmas Day" });
    await expect(addHoliday(a1, { date: "2026-12-25", name: "Again" })).rejects.toMatchObject({ code: "EXISTS" });
    await setClock("2026-12-28T09:00");
    await expect(removeHoliday(a1, "2026-12-25")).rejects.toMatchObject({ code: "PAST_DATE" });
  });
});
