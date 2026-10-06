import { describe, expect, it } from "vitest";
import { safeFileName, sniffType } from "@/server/domain/files";
import { billableWeight, leaveWeight, resolveDayStatus } from "@/server/domain/day-status";
import { buildMonthlyReport } from "@/server/domain/report";
import { computeBalance, DEFAULT_ENTITLEMENT } from "@/server/domain/leave-balance";

const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0]);

describe("file checks", () => {
  it("recognises PDF, PNG and JPEG by content", () => {
    expect(sniffType(new TextEncoder().encode("%PDF-1.7 ..."))).toBe("application/pdf");
    expect(sniffType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
  });
  it("rejects anything else, whatever it is called", () => {
    expect(sniffType(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(sniffType(new TextEncoder().encode("MZ executable"))).toBeNull();
    expect(sniffType(new Uint8Array())).toBeNull();
  });
  it("sanitises file names", () => {
    expect(safeFileName("../../etc/passwd")).toBe("_.._etc_passwd");
    expect(safeFileName("MC 12-Sep.pdf")).toBe("MC 12-Sep.pdf");
    expect(safeFileName("<script>.pdf")).toBe("_script_.pdf");
    expect(safeFileName("...")).toBe("document");
    expect(safeFileName("a".repeat(300))).toHaveLength(120);
  });
});

describe("half-day leave", () => {
  const ctx = { today: "2026-09-22", alertPassed: true, workingDay: true, assigned: true };
  it("a worked day with half-day leave is half billable and half leave", () => {
    const s = resolveDayStatus("2026-09-21", { attended: true, onApprovedLeave: false, halfDayLeave: true, correction: null }, ctx);
    expect(s).toBe("WORKED_HALF");
    expect([billableWeight(s), leaveWeight(s)]).toEqual([0.5, 0.5]);
  });
  it("half-day leave without a check-in is still a gap", () => {
    expect(resolveDayStatus("2026-09-21", { attended: false, onApprovedLeave: false, halfDayLeave: true, correction: null }, ctx)).toBe("GAP");
  });
  it("the report sums half days", () => {
    const r = buildMonthlyReport("2026-09", ["d1", "d2"], [{ id: "A", name: "A" }], (_p, d) => (d === "d1" ? "WORKED_HALF" : "WORKED"));
    expect(r.rows[0]).toMatchObject({ worked: 1.5, leave: 0.5, billable: 1.5 });
    expect(r.rate).toBe(0.75);
  });
});

describe("leave balance", () => {
  it("uses the default when no entitlement is set, and counts pending against it", () => {
    expect(computeBalance("ANNUAL", null, 3, 1.5)).toEqual({ leaveType: "ANNUAL", entitled: DEFAULT_ENTITLEMENT.ANNUAL, approved: 3, pending: 1.5, remaining: 13.5, isDefault: true });
    expect(computeBalance("MEDICAL", 2, 2, 0).remaining).toBe(0);
  });
});
