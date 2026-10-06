import { beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/server/db";
import { checkIn } from "@/server/services/attendance";
import { addAttachment, getAttachment, listAttachments } from "@/server/services/attachments";
import { balanceFor, setEntitlements } from "@/server/services/entitlements";
import { cancelLeave, decideLeave, leaveInput, submitLeave, withdrawLeave } from "@/server/services/leave";
import { getReport } from "@/server/services/report";
import type { CurrentUser } from "@/server/auth/session";
import { reseed } from "../support/test-db";
import { personnel, pmo, setClock, signals, supervisor } from "../support/fixtures";

const admin: CurrentUser = { id: "u-admin01", displayName: "Admin", role: "ADMIN", personnelId: null };
const sup2: CurrentUser = { id: "u-sup02", displayName: "Sup 2", role: "SUPERVISOR", personnelId: null };
const pdf = () => new TextEncoder().encode("%PDF-1.4\n% demo medical certificate\n");
const req = (o: Record<string, unknown> = {}) => ({ leaveType: "ANNUAL" as const, startDate: "2026-09-28", endDate: "2026-09-28", backupPersonnelId: "SP04", ...o });

describe("leave entitlements, half days, withdrawal, cancellation and documents", () => {
  beforeEach(() => reseed());

  it("a half day uses 0.5 of the balance and bills half the day once worked", async () => {
    expect(leaveInput.safeParse(req({ endDate: "2026-09-29", halfDay: "AM" })).success).toBe(false);
    const { id } = await submitLeave(personnel(1), req({ halfDay: "AM" }));
    expect((await balanceFor(pool(), "SP01", 2026, "ANNUAL")).pending).toBe(0.5);
    await decideLeave(supervisor, id, { decision: "APPROVE" });
    await setClock("2026-09-28T13:05");
    expect(await checkIn(personnel(1), "OFFICE", signals(true, "OFFICE"))).toMatchObject({ accepted: true });
    await setClock("2026-10-01T09:00");
    const row = (await getReport("2026-09")).report.rows.find((r) => r.personnelId === "SP01")!;
    expect(row.billable % 1).toBe(0.5);
  });

  it("refuses leave beyond the balance, counting pending requests", async () => {
    // SP02 already has 2 approved days, so 3 leaves exactly 1.
    await setEntitlements(admin, "SP02", { year: 2026, ANNUAL: 3, MEDICAL: 14, CHILDCARE: 6 });
    await expect(submitLeave(personnel(2), req({ endDate: "2026-09-29", backupPersonnelId: "SP04" }))).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
    await submitLeave(personnel(2), req({ startDate: "2026-09-23", endDate: "2026-09-23" }));
    await expect(submitLeave(personnel(2), req())).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
    expect((await balanceFor(pool(), "SP01", 2026, "ANNUAL")).isDefault).toBe(true);
    await expect(submitLeave(personnel(1), req({ startDate: "2026-12-31", endDate: "2027-01-04" }))).rejects.toMatchObject({ code: "SPANS_YEARS" });
  });

  it("only the requester may withdraw a pending request", async () => {
    const pending = Number((await pool().query("SELECT id FROM leave_request WHERE status = 'PENDING'")).rows[0].id);
    await expect(withdrawLeave(personnel(1), pending)).rejects.toMatchObject({ status: 404 });
    expect(await withdrawLeave(personnel(5), pending)).toEqual({ status: "WITHDRAWN" });
    await expect(withdrawLeave(personnel(5), pending)).rejects.toMatchObject({ code: "WRONG_STATUS" });
    await expect(decideLeave(supervisor, pending, { decision: "APPROVE" })).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
  });

  it("cancels approved leave before it starts and returns the days", async () => {
    const id = Number((await pool().query("SELECT id FROM leave_request WHERE personnel_id = 'SP03' AND start_date = '2026-09-24'")).rows[0].id);
    const before = (await balanceFor(pool(), "SP03", 2026, "ANNUAL")).remaining;
    expect(await cancelLeave(personnel(3), id)).toEqual({ status: "CANCELLED" });
    expect((await balanceFor(pool(), "SP03", 2026, "ANNUAL")).remaining).toBe(before + 2);
    await reseed();
    await setClock("2026-09-24T09:00");
    await expect(cancelLeave(personnel(3), id)).rejects.toMatchObject({ code: "ALREADY_STARTED" });
  });

  it("medical leave needs a certificate before approval; documents are checked and private", async () => {
    const { id } = await submitLeave(personnel(1), req({ leaveType: "MEDICAL" }));
    await expect(decideLeave(supervisor, id, { decision: "APPROVE" })).rejects.toMatchObject({ code: "MC_REQUIRED" });

    await expect(addAttachment(personnel(1), id, { name: "x.pdf", bytes: new TextEncoder().encode("<html>") })).rejects.toMatchObject({ code: "BAD_TYPE" });
    await expect(addAttachment(personnel(1), id, { name: "x.pdf", bytes: new Uint8Array() })).rejects.toMatchObject({ code: "EMPTY_FILE" });
    await expect(addAttachment(personnel(1), id, { name: "x.pdf", bytes: new Uint8Array(5 * 1024 * 1024 + 1) })).rejects.toMatchObject({ code: "TOO_LARGE" });
    await expect(addAttachment(personnel(2), id, { name: "x.pdf", bytes: pdf() })).rejects.toMatchObject({ status: 404 });

    const { id: aid } = await addAttachment(personnel(1), id, { name: "../MC.pdf", bytes: pdf() });
    expect((await listAttachments(supervisor, id))[0]).toMatchObject({ fileName: "_MC.pdf", contentType: "application/pdf" });
    await expect(listAttachments(sup2, id)).rejects.toMatchObject({ status: 404 });
    await expect(listAttachments(pmo, id)).rejects.toMatchObject({ status: 404 });
    expect(Buffer.from((await getAttachment(supervisor, id, aid)).content).equals(Buffer.from(pdf()))).toBe(true);

    const e = (await pool().query("SELECT payload FROM ledger_entry WHERE event_type = 'ATTACHMENT_ADDED'")).rows[0].payload;
    expect(e.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(e)).not.toContain("MC.pdf");
    expect(await decideLeave(supervisor, id, { decision: "APPROVE" })).toEqual({ status: "APPROVED" });
    await expect(pool().query("UPDATE leave_attachment SET file_name = 'x'")).rejects.toThrow(/permission denied/);
  });
});
