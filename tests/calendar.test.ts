import { describe, expect, it } from "vitest";
import { addDays, isIsoDate, isWorkingDay, monthBounds, workingDaysBetween } from "@/server/domain/calendar";

describe("calendar", () => {
  it("validates real dates only", () => {
    expect(isIsoDate("2026-09-22")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("22/09/2026")).toBe(false);
  });
  it("counts 22 working days in September 2026", () => {
    expect(workingDaysBetween("2026-09-01", "2026-09-30", new Set())).toHaveLength(22);
  });
  it("excludes weekends and public holidays", () => {
    const h = new Set(["2026-08-10"]);
    expect(isWorkingDay("2026-08-10", h)).toBe(false);
    expect(isWorkingDay("2026-08-08", h)).toBe(false); // Saturday
    expect(workingDaysBetween("2026-08-01", "2026-08-31", h)).toHaveLength(20);
  });
  it("handles month ends and leap years", () => {
    expect(monthBounds("2028-02").last).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(() => monthBounds("2026-13")).toThrow();
  });
});
