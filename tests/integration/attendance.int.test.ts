import { beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/server/db";
import { AppError } from "@/server/errors";
import { checkIn } from "@/server/services/attendance";
import { verifyLedger } from "@/server/services/audit";
import { reseed } from "../support/test-db";
import { ledgerCount, personnel, race, setClock, signals, supervisor } from "../support/fixtures";

const code = (e: unknown) => (e instanceof AppError ? e.code : (e as { code?: string }).code);

describe("check-in", () => {
  beforeEach(() => reseed());

  it("rejects WFH from an unmanaged device, records the refusal, and writes no attendance", async () => {
    const before = await ledgerCount("CHECK_IN_REJECTED");
    const out = await checkIn(personnel(3), "WFH", signals(false, "REMOTE"));
    expect(out).toMatchObject({ accepted: false, code: "UNMANAGED_DEVICE_REMOTE" });
    expect(await ledgerCount("CHECK_IN_REJECTED")).toBe(before + 1);
    const att = await pool().query("SELECT 1 FROM attendance WHERE personnel_id = 'SP03' AND work_date = '2026-09-22'");
    expect(att.rowCount).toBe(0);
  });

  it("accepts WFH from a managed device and records evidence with server time", async () => {
    const out = await checkIn(personnel(3), "WFH", signals(true, "REMOTE"));
    expect(out).toMatchObject({ accepted: true, location: "WFH", strength: "STRONG", checkedInAt: "2026-09-22T04:30:00.000Z" });
    const r = await pool().query("SELECT location, evidence_strength FROM attendance WHERE personnel_id = 'SP03' AND work_date = '2026-09-22'");
    expect(r.rows[0]).toEqual({ location: "WFH", evidence_strength: "STRONG" });
  });

  it("records office on a personal phone as medium evidence", async () => {
    expect(await checkIn(personnel(6), "OFFICE", signals(false, "OFFICE"))).toMatchObject({ accepted: true, strength: "MEDIUM" });
  });

  it("refuses a second check-in on the same day", async () => {
    await expect(checkIn(personnel(1), "OFFICE", signals(true, "OFFICE"))).rejects.toMatchObject({ status: 409, code: "ALREADY_CHECKED_IN" });
  });

  it("refuses check-in on approved leave, at weekends, and for non-personnel", async () => {
    await setClock("2026-09-24T09:00");
    await expect(checkIn(personnel(3), "OFFICE", signals(true, "OFFICE"))).rejects.toMatchObject({ code: "ON_LEAVE" });
    await setClock("2026-09-26T09:00");
    await expect(checkIn(personnel(1), "OFFICE", signals(true, "OFFICE"))).rejects.toMatchObject({ code: "NOT_WORKING_DAY" });
    await expect(checkIn(supervisor, "OFFICE", signals(true, "OFFICE"))).rejects.toMatchObject({ code: "NOT_PERSONNEL" });
  });

  it("allows exactly one check-in when eight arrive at once, and keeps the ledger chain intact", async () => {
    const res = await race(Array.from({ length: 8 }, () => () => checkIn(personnel(6), "OFFICE", signals(true, "OFFICE"))));
    expect(res.ok.filter((o) => o.accepted)).toHaveLength(1);
    expect(res.failed.every((e) => ["ALREADY_CHECKED_IN", "23505"].includes(code(e) ?? ""))).toBe(true);
    const n = await pool().query("SELECT count(*)::int AS n FROM attendance WHERE personnel_id = 'SP06' AND work_date = '2026-09-22'");
    expect(n.rows[0].n).toBe(1);
    expect((await verifyLedger()).ok).toBe(true);
  });
});
