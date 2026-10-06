import type { IsoDate, IsoMonth } from "./calendar";
import { billableWeight, leaveWeight, type DayStatus } from "./day-status";

export interface ReportRow {
  personnelId: string;
  name: string;
  worked: number;
  correctedWorked: number;
  leave: number;
  gaps: number;
  billable: number;
  /** Working days in the period on which this person was assigned; their share of capacity. */
  assignedDays: number;
}
export interface MonthlyReport {
  month: IsoMonth;
  workingDays: number;
  periodEnd: IsoDate | null;
  rows: ReportRow[];
  billable: number;
  capacity: number;
  rate: number;
  gaps: number;
}

/**
 * Billing is on actual working days only: leave is excluded, corrected days are shown separately.
 * People with no assigned day in the period are left out of the report.
 */
export function buildMonthlyReport(
  month: IsoMonth,
  days: IsoDate[],
  personnel: { id: string; name: string }[],
  statusOf: (personnelId: string, day: IsoDate) => DayStatus,
): MonthlyReport {
  const rows = personnel.map((p) => {
    const statuses = days.map((d) => statusOf(p.id, d)).filter((s) => s !== "NOT_ASSIGNED");
    const sum = (w: (s: DayStatus) => number) => statuses.reduce((a, s) => a + w(s), 0);
    const worked = sum((s) => (s === "WORKED" ? 1 : s === "WORKED_HALF" ? 0.5 : 0));
    const correctedWorked = statuses.filter((s) => s === "CORRECTED_WORKED").length;
    return {
      personnelId: p.id, name: p.name, worked, correctedWorked,
      leave: sum(leaveWeight), gaps: statuses.filter((s) => s === "GAP").length, billable: sum(billableWeight), assignedDays: statuses.length,
    };
  }).filter((r) => r.assignedDays > 0);
  const billable = rows.reduce((a, r) => a + r.billable, 0);
  // Capacity is pro-rated: only days each person was assigned to the contract count.
  const capacity = rows.reduce((a, r) => a + r.assignedDays, 0);
  return {
    month, workingDays: days.length, periodEnd: days.at(-1) ?? null, rows, billable, capacity,
    rate: capacity === 0 ? 0 : billable / capacity,
    gaps: rows.reduce((a, r) => a + r.gaps, 0),
  };
}
