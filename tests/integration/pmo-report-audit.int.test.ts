import { beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/server/db";
import { workingDaysBetween } from "@/server/domain/calendar";
import { correctionInput, pmoDashboard, recordCorrection, recordFollowUp } from "@/server/services/pmo";
import { acceptReport, getReport, toCsv } from "@/server/services/report";
import { verifyLedger } from "@/server/services/audit";
import { reseed, testDatabaseUrl, withClient } from "../support/test-db";
import { ledgerCount, pmo, race, setClock, supervisor } from "../support/fixtures";

const sqlCount = async (sql: string) => (await pool().query(sql)).rows[0].n as number;
const IDS = ["SP01", "SP02", "SP03", "SP04", "SP05", "SP06"];

async function closeAllGaps(month: string) {
  const days = workingDaysBetween(`${month}-01`, `${month}-30`, new Set());
  for (const d of days) for (const p of IDS) {
    await recordCorrection(pmo, { personnelId: p, workDate: d, outcome: "LEAVE", reason: "Confirmed leave, form filed late" })
      .catch((e) => { if (e.code !== "NOT_A_GAP") throw e; });
  }
}

describe("PMO exception view", () => {
  beforeEach(() => reseed());

  it("lists who has not checked in after the alert time, and nobody before it", async () => {
    let d = await pmoDashboard();
    expect(d.missingToday.map((p) => p.id)).toEqual(["SP03", "SP06"]);
    await setClock("2026-09-22T11:59");
    d = await pmoDashboard();
    expect(d.missingToday).toEqual([]);
    await setClock("2026-09-22T12:00");
    expect((await pmoDashboard()).missingToday).toHaveLength(2);
  });

  it("reports past gaps and a month-to-date rate that matches the raw records", async () => {
    const d = await pmoDashboard();
    expect(d.gaps.map((g) => `${g.personnel.id}|${g.date}`)).toEqual(["SP06|2026-09-15"]);
    const attended = await sqlCount("SELECT count(*)::int AS n FROM attendance WHERE work_date BETWEEN '2026-09-01' AND '2026-09-22'");
    expect(d.mtd.capacity).toBe(6 * 16);
    expect(d.mtd.billable).toBe(attended);
  });

  it("records a follow-up once, however many times it is clicked", async () => {
    const before = await ledgerCount("FOLLOW_UP");
    await recordFollowUp(pmo, "SP06");
    await recordFollowUp(pmo, "SP06");
    expect(await sqlCount("SELECT count(*)::int AS n FROM follow_up")).toBe(1);
    expect(await ledgerCount("FOLLOW_UP")).toBe(before + 1);
    await expect(recordFollowUp(pmo, "NOPE")).rejects.toMatchObject({ status: 404 });
  });

  it("closes a gap only with a reasoned correction, once, and never in an accepted month", async () => {
    const input = { personnelId: "SP06", workDate: "2026-09-15", outcome: "LEAVE" as const, reason: "Medical certificate received" };
    await expect(recordCorrection(pmo, { ...input, personnelId: "SP01", workDate: "2026-09-14" })).rejects.toMatchObject({ code: "NOT_A_GAP" });
    await recordCorrection(pmo, input);
    expect((await pmoDashboard()).gaps).toEqual([]);
    await expect(recordCorrection(pmo, input)).rejects.toMatchObject({ code: "NOT_A_GAP" });
    await expect(recordCorrection(pmo, { ...input, workDate: "2026-08-14" })).rejects.toMatchObject({ code: "MONTH_CLOSED" });
    expect(correctionInput.safeParse({ ...input, reason: "ok" }).success).toBe(false);
  });
});

describe("monthly report", () => {
  beforeEach(() => reseed());

  it("serves August as the frozen, accepted snapshot with correct totals", async () => {
    const v = await getReport("2026-08");
    expect(v.acceptance?.acceptedBy).toBe("IRAS Supervisor (demo)");
    expect(v.report.workingDays).toBe(20); // 21 weekdays less National Day (observed)
    expect(v.report.capacity).toBe(120);
    expect(v.report.billable).toBe(120 - 3); // three approved leave days
    expect(v.report.rows.find((r) => r.personnelId === "SP02")?.correctedWorked).toBe(1);
    expect(v.corrections).toHaveLength(1);
  });

  it("will not accept a month that is still running, or one with open gaps", async () => {
    await expect(acceptReport(supervisor, "2026-09")).rejects.toMatchObject({ code: "MONTH_OPEN" });
    await setClock("2026-10-01T09:00");
    await expect(acceptReport(supervisor, "2026-09")).rejects.toMatchObject({ code: "GAPS_OPEN" });
  });

  it("accepts a complete month once, freezes it, and locks further corrections", async () => {
    await setClock("2026-10-01T09:00");
    await closeAllGaps("2026-09");
    const draft = await getReport("2026-09");
    expect(draft.report.gaps).toBe(0);
    expect(draft.report.capacity).toBe(6 * 22);
    const attended = await sqlCount("SELECT count(*)::int AS n FROM attendance WHERE to_char(work_date, 'YYYY-MM') = '2026-09'");
    expect(draft.report.billable).toBe(attended);

    const { seq } = await acceptReport(supervisor, "2026-09");
    const after = await getReport("2026-09");
    expect(after.acceptance?.ledgerSeq).toBe(seq);
    expect(after.report).toEqual(draft.report);
    await expect(acceptReport(supervisor, "2026-09")).rejects.toMatchObject({ code: "ALREADY_ACCEPTED" });
    await expect(recordCorrection(pmo, { personnelId: "SP01", workDate: "2026-09-30", outcome: "LEAVE", reason: "Late change" }))
      .rejects.toMatchObject({ code: "MONTH_CLOSED" });
  });

  it("accepts exactly once when three acceptances arrive together", async () => {
    await setClock("2026-10-01T09:00");
    await closeAllGaps("2026-09");
    const res = await race([1, 2, 3].map(() => () => acceptReport(supervisor, "2026-09")));
    expect(res.ok).toHaveLength(1);
    expect(await sqlCount("SELECT count(*)::int AS n FROM monthly_report WHERE report_month = '2026-09'")).toBe(1);
  });

  it("exports CSV that cannot inject spreadsheet formulas", async () => {
    const v = await getReport("2026-08");
    v.report.rows[0].name = "=HYPERLINK(\"http://x\")";
    const csv = toCsv(v);
    expect(csv.split("\r\n")[0]).toBe("Service personnel,Worked,Corrected to worked,Leave,Gaps,Billable");
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).toContain("Accepted by IRAS Supervisor (demo)");
  });
});

describe("audit ledger and immutability", () => {
  beforeEach(() => reseed());

  it("keeps a contiguous, verifiable chain", async () => {
    const v = await verifyLedger();
    expect(v.ok).toBe(true);
    const r = (await pool().query("SELECT count(*)::int AS n, max(seq)::int AS m, min(seq)::int AS f FROM ledger_entry")).rows[0];
    expect([r.f, r.m]).toEqual([1, r.n]);
  });

  it.each([
    ["UPDATE ledger_entry SET actor_id = 'x' WHERE seq = 1"],
    ["DELETE FROM ledger_entry WHERE seq = 1"],
    ["UPDATE attendance SET location = 'WFH' WHERE id = 1"],
    ["DELETE FROM attendance WHERE id = 1"],
    ["UPDATE monthly_report SET billable_days = 999"],
    ["DELETE FROM day_correction"],
    ["DELETE FROM leave_request"],
    ["TRUNCATE ledger_entry"],
    ["ALTER TABLE ledger_entry DISABLE TRIGGER ledger_entry_immutable"],
  ])("the application role is refused by privileges: %s", async (sql) => {
    await expect(pool().query(sql)).rejects.toThrow(/permission denied|must be owner/);
  });

  it.each([
    ["UPDATE ledger_entry SET actor_id = 'x' WHERE seq = 1"],
    ["DELETE FROM attendance WHERE id = 1"],
    ["UPDATE monthly_report SET billable_days = 999"],
  ])("even the schema owner is stopped by the append-only triggers: %s", async (sql) => {
    await expect(withClient(testDatabaseUrl(), (c) => c.query(sql))).rejects.toThrow(/not permitted: records are append-only/);
  });

  it("detects tampering by an administrator who bypasses the database guard", async () => {
    // Only the owner can do this - the scenario is a database administrator acting outside the app.
    await withClient(testDatabaseUrl(), (c) => c.query(`ALTER TABLE ledger_entry DISABLE TRIGGER ledger_entry_immutable;
      UPDATE ledger_entry SET payload = jsonb_set(payload, '{workDate}', '"1999-01-01"') WHERE seq = 10;
      ALTER TABLE ledger_entry ENABLE TRIGGER ledger_entry_immutable;`));
    expect(await verifyLedger()).toMatchObject({ ok: false, brokenAt: 10 });
  });

  const tamper = (where: string) => withClient(testDatabaseUrl(), (c) => c.query(`ALTER TABLE ledger_entry DISABLE TRIGGER ledger_entry_immutable;
    UPDATE ledger_entry SET actor_id = 'intruder' WHERE ${where};
    ALTER TABLE ledger_entry ENABLE TRIGGER ledger_entry_immutable;`));

  it("records a checkpoint after a full verification and checks quickly from it", async () => {
    const full = await verifyLedger({ full: true });
    expect(full).toMatchObject({ ok: true, full: true });
    const quick = await verifyLedger();
    expect(quick).toMatchObject({ ok: true, from: full.count });
    expect(quick.lastFull).not.toBeNull();
  });

  it("catches tampering after the checkpoint quickly, and before it only with a full run", async () => {
    await verifyLedger({ full: true }); // checkpoint at the current head (220)
    await tamper("seq = 50");
    expect((await verifyLedger()).ok).toBe(true); // documented limit of the quick check
    expect(await verifyLedger({ full: true })).toMatchObject({ ok: false, brokenAt: 50 });
  });

  it("catches a tampered checkpoint entry; an owner who also rewrites checkpoints needs off-database anchoring", async () => {
    const { count } = await verifyLedger({ full: true });
    await tamper(`seq = ${count}`);
    await withClient(testDatabaseUrl(), (c) => c.query(`ALTER TABLE ledger_entry DISABLE TRIGGER ledger_entry_immutable;
      UPDATE ledger_entry SET hash = repeat('a', 64) WHERE seq = ${count};
      ALTER TABLE ledger_entry ENABLE TRIGGER ledger_entry_immutable;`));
    expect(await verifyLedger()).toMatchObject({ ok: false, brokenAt: count });

    await reseed();
    await verifyLedger({ full: true }); // checkpoint at 220
    // ledger_checkpoint references ledger_entry, so removing the head means removing its checkpoint too:
    // a would-be intruder has to hide the newest entry. The older checkpoint still exposes it.
    await withClient(testDatabaseUrl(), (c) => c.query(`INSERT INTO ledger_checkpoint (seq, hash, full_verify)
      SELECT seq, hash, true FROM ledger_entry WHERE seq = 219`));
    await withClient(testDatabaseUrl(), (c) => c.query(`ALTER TABLE ledger_entry DISABLE TRIGGER ledger_entry_immutable;
      ALTER TABLE ledger_checkpoint DISABLE TRIGGER ledger_checkpoint_immutable;
      DELETE FROM ledger_checkpoint WHERE seq = 220; DELETE FROM ledger_entry WHERE seq = 220;
      ALTER TABLE ledger_checkpoint ENABLE TRIGGER ledger_checkpoint_immutable;
      ALTER TABLE ledger_entry ENABLE TRIGGER ledger_entry_immutable;`));
    // Known limit: with owner rights over both tables the chain alone cannot tell. The fix is to
    // publish the head hash outside the database (see docs/ARCHITECTURE.md).
    expect((await verifyLedger({ full: true })).ok).toBe(true);
  });

  it("detects removal of the newest entries when a checkpoint points past them", async () => {
    await verifyLedger({ full: true }); // checkpoint at 220
    await withClient(testDatabaseUrl(), (c) => c.query(`ALTER TABLE ledger_checkpoint DROP CONSTRAINT ledger_checkpoint_seq_fkey;
      ALTER TABLE ledger_entry DISABLE TRIGGER ledger_entry_immutable;
      DELETE FROM ledger_entry WHERE seq >= 218;
      ALTER TABLE ledger_entry ENABLE TRIGGER ledger_entry_immutable;`));
    expect(await verifyLedger({ full: true })).toMatchObject({ ok: false, brokenAt: 218 });
    await reseed();
    await withClient(testDatabaseUrl(), (c) => c.query(
      "ALTER TABLE ledger_checkpoint ADD CONSTRAINT ledger_checkpoint_seq_fkey FOREIGN KEY (seq) REFERENCES ledger_entry (seq)"));
  });

  it("detects a gap in the middle of the chain", async () => {
    await withClient(testDatabaseUrl(), (c) => c.query(`ALTER TABLE ledger_entry DISABLE TRIGGER ledger_entry_immutable;
      DELETE FROM ledger_entry WHERE seq = 100;
      ALTER TABLE ledger_entry ENABLE TRIGGER ledger_entry_immutable;`));
    expect(await verifyLedger({ full: true })).toMatchObject({ ok: false, brokenAt: 100 });
  });
});

