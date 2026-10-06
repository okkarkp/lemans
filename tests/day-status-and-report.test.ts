import { describe, expect, it } from "vitest";
import { resolveDayStatus } from "@/server/domain/day-status";
import { buildMonthlyReport } from "@/server/domain/report";
import { computeCoverage } from "@/server/domain/coverage";

const none = { attended: false, onApprovedLeave: false, correction: null };
const ctx = { today: "2026-09-22", alertPassed: false, workingDay: true, assigned: true };

describe("resolveDayStatus", () => {
  it("prefers attendance over everything else", () => {
    expect(resolveDayStatus("2026-09-21", { ...none, attended: true, onApprovedLeave: true }, ctx)).toBe("WORKED");
  });
  it("marks a past day with no record as a gap", () => {
    expect(resolveDayStatus("2026-09-21", none, ctx)).toBe("GAP");
  });
  it("only marks today as a gap after the alert time", () => {
    expect(resolveDayStatus("2026-09-22", none, ctx)).toBe("AWAITING");
    expect(resolveDayStatus("2026-09-22", none, { ...ctx, alertPassed: true })).toBe("GAP");
  });
  it("closes a gap with a correction", () => {
    expect(resolveDayStatus("2026-09-21", { ...none, correction: "WORKED" }, ctx)).toBe("CORRECTED_WORKED");
  });
  it("treats days outside the assignment period as not assigned, before anything else", () => {
    expect(resolveDayStatus("2026-09-21", { ...none, attended: true }, { ...ctx, assigned: false })).toBe("NOT_ASSIGNED");
  });
  it("ignores non-working days", () => {
    expect(resolveDayStatus("2026-09-20", none, { ...ctx, workingDay: false })).toBe("NON_WORKING");
  });
});

describe("buildMonthlyReport", () => {
  it("bills worked and corrected-worked days only, and computes the rate against capacity", () => {
    const people = [{ id: "A", name: "A" }, { id: "B", name: "B" }];
    const days = ["d1", "d2", "d3"];
    const table: Record<string, string[]> = { A: ["WORKED", "LEAVE", "CORRECTED_WORKED"], B: ["WORKED", "GAP", "WORKED"] };
    const r = buildMonthlyReport("2026-09", days, people, (p, d) => table[p][days.indexOf(d)] as never);
    expect(r.rows[0]).toMatchObject({ worked: 1, correctedWorked: 1, leave: 1, billable: 2, gaps: 0 });
    expect(r.rows[1]).toMatchObject({ billable: 2, gaps: 1 });
    expect(r.billable).toBe(4);
    expect(r.capacity).toBe(6);
    expect(r.rate).toBeCloseTo(4 / 6);
  });
  it("pro-rates capacity to assigned days and leaves out people with none", () => {
    const people = [{ id: "A", name: "A" }, { id: "B", name: "B" }, { id: "C", name: "C" }];
    const days = ["d1", "d2", "d3", "d4"];
    const table: Record<string, string[]> = {
      A: ["WORKED", "WORKED", "WORKED", "WORKED"],
      B: ["WORKED", "WORKED", "NOT_ASSIGNED", "NOT_ASSIGNED"], // left after d2
      C: ["NOT_ASSIGNED", "NOT_ASSIGNED", "NOT_ASSIGNED", "NOT_ASSIGNED"],
    };
    const r = buildMonthlyReport("2026-09", days, people, (p, d) => table[p][days.indexOf(d)] as never);
    expect(r.rows.map((x) => x.personnelId)).toEqual(["A", "B"]);
    expect(r.rows[1]).toMatchObject({ assignedDays: 2, gaps: 0, billable: 2 });
    expect(r.capacity).toBe(6);
    expect(r.rate).toBe(1);
  });
  it("returns a zero rate, not NaN, for an empty period", () => {
    expect(buildMonthlyReport("2026-09", [], [{ id: "A", name: "A" }], () => "WORKED").rate).toBe(0);
  });
});

describe("computeCoverage", () => {
  it("finds the worst day", () => {
    const away: Record<string, string[]> = { d1: ["A"], d2: ["A", "B"] };
    const r = computeCoverage(["d1", "d2"], 6, (d) => new Set(away[d]));
    expect(r.minRatio).toBeCloseTo(4 / 6);
    expect(r.worstDay).toBe("d2");
  });
  it("rejects a day with nobody assigned", () => {
    expect(() => computeCoverage(["d1"], 0, () => new Set())).toThrow();
  });
  it("uses the headcount assigned on each day", () => {
    const r = computeCoverage(["d1", "d2"], (d) => (d === "d1" ? 6 : 5), () => new Set(["A"]));
    expect(r.minRatio).toBeCloseTo(4 / 5);
    expect(r.worstDay).toBe("d2");
  });
});
