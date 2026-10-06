import { beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/server/db";
import { coverageFor, decideLeave, decisionInput, leaveInput, submitLeave } from "@/server/services/leave";
import { verifyLedger } from "@/server/services/audit";
import { reseed } from "../support/test-db";
import { ledgerCount, personnel, race, supervisor } from "../support/fixtures";

const req = (over: Partial<{ leaveType: "ANNUAL"; startDate: string; endDate: string; backupPersonnelId: string }> = {}) =>
  ({ leaveType: "ANNUAL" as const, startDate: "2026-09-28", endDate: "2026-09-28", backupPersonnelId: "SP04", ...over });
const pendingId = async () => Number((await pool().query("SELECT id FROM leave_request WHERE status = 'PENDING' ORDER BY id LIMIT 1")).rows[0].id);

describe("leave requests", () => {
  beforeEach(() => reseed());

  it("computes coverage with the requester away", async () => {
    const c = await coverageFor(pool(), "SP01", "2026-09-28", "2026-09-28");
    expect(c.minRatio).toBeCloseTo(5 / 6);
    expect(c.passes).toBe(true);
  });

  it("submits a valid request as pending and records it", async () => {
    const before = await ledgerCount("LEAVE_REQUESTED");
    const { id } = await submitLeave(personnel(1), req());
    const r = await pool().query("SELECT status FROM leave_request WHERE id = $1", [id]);
    expect(r.rows[0].status).toBe("PENDING");
    expect(await ledgerCount("LEAVE_REQUESTED")).toBe(before + 1);
  });

  it("enforces the business rules", async () => {
    await expect(submitLeave(personnel(1), req({ startDate: "2026-09-29", endDate: "2026-09-30" }))).rejects.toMatchObject({ code: "SLA_COVERAGE" });
    await expect(submitLeave(personnel(1), req({ startDate: "2026-09-01", endDate: "2026-09-01" }))).rejects.toMatchObject({ code: "BACKDATED" });
    await expect(submitLeave(personnel(3), req({ startDate: "2026-09-25", endDate: "2026-09-28" }))).rejects.toMatchObject({ code: "OVERLAP" });
    await expect(submitLeave(personnel(1), req({ startDate: "2026-09-24", endDate: "2026-09-24", backupPersonnelId: "SP03" }))).rejects.toMatchObject({ code: "BACKUP_AWAY" });
    await expect(submitLeave(personnel(1), req({ backupPersonnelId: "SP01" }))).rejects.toMatchObject({ code: "BACKUP_SELF" });
    await expect(submitLeave(personnel(1), req({ backupPersonnelId: "NOPE" }))).rejects.toMatchObject({ code: "BACKUP_UNKNOWN" });
    await expect(submitLeave(personnel(1), req({ startDate: "2026-10-01", endDate: "2026-11-15" }))).rejects.toMatchObject({ code: "TOO_LONG" });
    await expect(submitLeave(personnel(1), req({ startDate: "2026-09-26", endDate: "2026-09-27" }))).rejects.toMatchObject({ code: "NO_WORKING_DAYS" });
    await expect(submitLeave(supervisor, req())).rejects.toMatchObject({ code: "NOT_PERSONNEL" });
  });

  it("validates input shape at the boundary", () => {
    expect(leaveInput.safeParse(req({ startDate: "2026-02-30", endDate: "2026-02-30" })).success).toBe(false);
    expect(leaveInput.safeParse(req({ startDate: "2026-09-29", endDate: "2026-09-28" })).success).toBe(false);
    expect(leaveInput.safeParse({ ...req(), leaveType: "HOLIDAY" }).success).toBe(false);
    expect(decisionInput.safeParse({ decision: "REJECT" }).success).toBe(false);
    expect(decisionInput.safeParse({ decision: "REJECT", note: "Clashes with go-live" }).success).toBe(true);
  });

  it("lets only one of two simultaneous requests through when both would breach coverage", async () => {
    const res = await race([() => submitLeave(personnel(1), req()), () => submitLeave(personnel(2), req({ backupPersonnelId: "SP05" }))]);
    expect(res.ok).toHaveLength(1);
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0]).toMatchObject({ code: "SLA_COVERAGE" });
  });

  it("approves once, refuses a second decision, and records both outcomes correctly", async () => {
    const id = await pendingId();
    expect(await decideLeave(supervisor, id, { decision: "APPROVE" })).toEqual({ status: "APPROVED" });
    await expect(decideLeave(supervisor, id, { decision: "REJECT", note: "Changed my mind" })).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
    await expect(decideLeave(supervisor, 999999, { decision: "APPROVE" })).rejects.toMatchObject({ status: 404 });
  });

  it("applies exactly one decision when two arrive at once", async () => {
    const id = await pendingId();
    const res = await race([
      () => decideLeave(supervisor, id, { decision: "APPROVE" }),
      () => decideLeave(supervisor, id, { decision: "REJECT", note: "Not this week" }),
    ]);
    expect(res.ok).toHaveLength(1);
    expect(res.failed[0]).toMatchObject({ code: "ALREADY_DECIDED" });
    expect((await verifyLedger()).ok).toBe(true);
  });
});
