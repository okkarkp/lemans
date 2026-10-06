import type { IsoDate } from "./calendar";

export interface CoverageResult {
  minRatio: number;
  worstDay: IsoDate | null;
  byDay: { day: IsoDate; present: number; ratio: number }[];
}

/** Share of the team available on each working day, given who is (or would be) away. */
export function computeCoverage(
  days: IsoDate[],
  headcountOn: number | ((day: IsoDate) => number),
  absentOn: (day: IsoDate) => ReadonlySet<string>,
): CoverageResult {
  let minRatio = 1;
  let worstDay: IsoDate | null = null;
  const byDay = days.map((day) => {
    const headcount = typeof headcountOn === "number" ? headcountOn : headcountOn(day);
    if (headcount <= 0) throw new RangeError(`No one is assigned on ${day}`);
    const present = Math.max(0, headcount - absentOn(day).size);
    const ratio = present / headcount;
    if (ratio < minRatio) { minRatio = ratio; worstDay = day; }
    return { day, present, ratio };
  });
  return { minRatio, worstDay, byDay };
}
