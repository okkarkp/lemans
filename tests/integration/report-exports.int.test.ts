import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/server/db";
import { exportLedgerCsv, ledgerDigest } from "@/server/services/audit";
import { getReport, invoiceInput, recordInvoice, toXlsx } from "@/server/services/report";
import { reseed } from "../support/test-db";
import { pmo } from "../support/fixtures";

describe("report exports, invoices and audit exports", () => {
  beforeEach(() => reseed());

  it("produces an Excel workbook whose figures match the report", async () => {
    const v = await getReport("2026-08");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await toXlsx(v) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Summary", "Personnel", "Corrections"]);
    const summary = Object.fromEntries(wb.getWorksheet("Summary")!.getSheetValues().filter(Boolean).map((r) => [(r as unknown[])[1], (r as unknown[])[2]]));
    expect(summary["Billable days"]).toBe(v.report.billable);
    expect(summary["Status"]).toBe("Accepted");
    expect(wb.getWorksheet("Personnel")!.rowCount).toBe(v.report.rows.length + 2);
    expect(wb.getWorksheet("Corrections")!.getCell("D2").value).toMatch(/sign-in outage/);
  });

  it("records the invoice once, only for an accepted month", async () => {
    await expect(recordInvoice(pmo, "2026-09", { invoiceRef: "INV-2026-09" })).rejects.toMatchObject({ code: "NOT_ACCEPTED" });
    await recordInvoice(pmo, "2026-08", { invoiceRef: "INV-2026-08" });
    expect((await getReport("2026-08")).invoice).toMatchObject({ invoiceRef: "INV-2026-08", raisedBy: "Accenture PMO (demo)" });
    await expect(recordInvoice(pmo, "2026-08", { invoiceRef: "INV-AGAIN" })).rejects.toMatchObject({ code: "ALREADY_INVOICED" });
    expect(invoiceInput.safeParse({ invoiceRef: "=cmd|calc" }).success).toBe(false);
    await expect(pool().query("UPDATE invoice_record SET invoice_ref = 'X'")).rejects.toThrow(/permission denied/);
  });

  it("exports ledger entries for a date range as safe CSV", async () => {
    const csv = await exportLedgerCsv("2026-09-01", "2026-09-30");
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("seq,occurred_at,recorded_at,actor_id,event_type,payload,prev_hash,hash");
    const inRange = (await pool().query(
      "SELECT count(*)::int AS n FROM ledger_entry WHERE (occurred_at AT TIME ZONE 'Asia/Singapore')::date BETWEEN '2026-09-01' AND '2026-09-30'")).rows[0].n;
    expect(lines.length - 1).toBe(inRange);
  });

  it("issues a digest that matches the ledger head", async () => {
    const d = await ledgerDigest();
    const head = (await pool().query("SELECT seq, hash FROM ledger_entry ORDER BY seq DESC LIMIT 1")).rows[0];
    expect(d).toMatchObject({ headSeq: Number(head.seq), headHash: head.hash, chainVerified: true });
  });
});
