import { beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/server/db";
import { decideLeave, listPending } from "@/server/services/leave";
import { liveTeamView } from "@/server/services/pmo";
import { createDelegation, createTeam, revokeDelegation, updateTeam } from "@/server/services/teams";
import type { CurrentUser } from "@/server/auth/session";
import { reseed } from "../support/test-db";
import { pmo, setClock, supervisor } from "../support/fixtures";

const sup2: CurrentUser = { id: "u-sup02", displayName: "IRAS Supervisor 2 (demo)", role: "SUPERVISOR", personnelId: null };
const admin: CurrentUser = { id: "u-admin01", displayName: "System Administrator (demo)", role: "ADMIN", personnelId: null };
const pendingId = async () => Number((await pool().query("SELECT id FROM leave_request WHERE status = 'PENDING' LIMIT 1")).rows[0].id);

describe("team-scoped approvals and delegation", () => {
  beforeEach(() => reseed());

  it("shows and lets only the team's own supervisor decide", async () => {
    // The seeded pending request is from SP05, in the Application team supervised by u-sup01.
    expect(await listPending(supervisor)).toHaveLength(1);
    expect(await listPending(sup2)).toHaveLength(0);
    await expect(decideLeave(sup2, await pendingId(), { decision: "APPROVE" })).rejects.toMatchObject({ status: 403 });
    expect(await decideLeave(supervisor, await pendingId(), { decision: "APPROVE" })).toEqual({ status: "APPROVED" });
  });

  it("limits a supervisor's live view to their teams; the PMO sees everyone", async () => {
    expect((await liveTeamView(supervisor)).rows.map((r) => r.id)).toEqual(["SP01", "SP02", "SP05"]);
    expect((await liveTeamView(sup2)).rows.map((r) => r.id)).toEqual(["SP03", "SP04", "SP06"]);
    expect((await liveTeamView(pmo)).rows).toHaveLength(6);
  });

  it("a delegation lets the delegate approve for its period only, and revoking ends it", async () => {
    const { id } = await createDelegation(supervisor, { delegateId: "u-sup02", startDate: "2026-09-22", endDate: "2026-09-23" });
    expect(await listPending(sup2)).toHaveLength(1);
    await setClock("2026-09-24T09:00");
    expect(await listPending(sup2)).toHaveLength(0);
    await setClock("2026-09-22T12:30");
    await revokeDelegation(supervisor, id);
    expect(await listPending(sup2)).toHaveLength(0);
    await expect(revokeDelegation(supervisor, id)).rejects.toMatchObject({ code: "ALREADY_REVOKED" });
  });

  it("enforces delegation rules", async () => {
    await expect(createDelegation(supervisor, { delegateId: "u-sup01", startDate: "2026-09-22", endDate: "2026-09-22" })).rejects.toMatchObject({ code: "DELEGATE_SELF" });
    await expect(createDelegation(supervisor, { delegateId: "u-pmo01", startDate: "2026-09-22", endDate: "2026-09-22" })).rejects.toMatchObject({ code: "NOT_A_SUPERVISOR" });
    await expect(createDelegation(supervisor, { delegateId: "u-sup02", startDate: "2026-09-01", endDate: "2026-09-30" })).rejects.toMatchObject({ code: "BACKDATED" });
    await expect(createDelegation(supervisor, { delegateId: "u-sup02", startDate: "2026-09-22", endDate: "2027-01-31" })).rejects.toMatchObject({ code: "TOO_LONG" });
    await expect(createDelegation(supervisor, { delegatorId: "u-sup02", delegateId: "u-sup01", startDate: "2026-09-22", endDate: "2026-09-22" })).rejects.toMatchObject({ status: 403 });
    await createDelegation(supervisor, { delegateId: "u-sup02", startDate: "2026-09-22", endDate: "2026-09-30" });
    await expect(createDelegation(supervisor, { delegateId: "u-sup02", startDate: "2026-09-25", endDate: "2026-10-02" })).rejects.toMatchObject({ code: "OVERLAP" });
    const { id } = await createDelegation(admin, { delegatorId: "u-sup02", delegateId: "u-sup01", startDate: "2026-09-22", endDate: "2026-09-22" });
    await expect(revokeDelegation(supervisor, id)).rejects.toMatchObject({ status: 403 });
    await revokeDelegation(admin, id);
  });

  it("a team with no supervisor can be approved by any supervisor; supervisors must be real supervisors", async () => {
    await updateTeam(admin, "APP", { supervisorId: null });
    expect(await listPending(sup2)).toHaveLength(1);
    await expect(updateTeam(admin, "APP", { supervisorId: "u-pmo01" })).rejects.toMatchObject({ code: "NOT_A_SUPERVISOR" });
    await expect(createTeam(admin, { id: "APP", name: "Duplicate", supervisorId: null })).rejects.toMatchObject({ code: "TEAM_EXISTS" });
    expect(await createTeam(admin, { id: "SEC", name: "Security", supervisorId: "u-sup02" })).toEqual({ id: "SEC" });
  });
});
