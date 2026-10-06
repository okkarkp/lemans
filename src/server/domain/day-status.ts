import type { IsoDate } from "./calendar";

export type DayStatus = "NOT_ASSIGNED" | "WORKED" | "WORKED_HALF" | "LEAVE" | "CORRECTED_WORKED" | "CORRECTED_LEAVE" | "GAP" | "AWAITING" | "NON_WORKING";

export interface DayFacts {
  attended: boolean;
  onApprovedLeave: boolean;
  /** Approved half-day leave: the other half must still be worked. */
  halfDayLeave?: boolean;
  correction: "LEAVE" | "WORKED" | null;
}
export interface DayContext {
  today: IsoDate;
  alertPassed: boolean;
  workingDay: boolean;
  /** Whether the person was assigned to the contract on this date. */
  assigned: boolean;
}

/** Every working day must end up worked or accounted for; anything else is a gap. */
export function resolveDayStatus(date: IsoDate, facts: DayFacts, ctx: DayContext): DayStatus {
  if (!ctx.assigned) return "NOT_ASSIGNED";
  if (!ctx.workingDay) return "NON_WORKING";
  if (facts.attended) return facts.halfDayLeave ? "WORKED_HALF" : "WORKED";
  if (facts.onApprovedLeave) return "LEAVE";
  if (facts.correction === "WORKED") return "CORRECTED_WORKED";
  if (facts.correction === "LEAVE") return "CORRECTED_LEAVE";
  if (date < ctx.today || (date === ctx.today && ctx.alertPassed)) return "GAP";
  return "AWAITING";
}

/** Share of the day that is billable: a half-day leave day bills half. */
export const billableWeight = (s: DayStatus) => (s === "WORKED" || s === "CORRECTED_WORKED" ? 1 : s === "WORKED_HALF" ? 0.5 : 0);
export const leaveWeight = (s: DayStatus) => (s === "LEAVE" || s === "CORRECTED_LEAVE" ? 1 : s === "WORKED_HALF" ? 0.5 : 0);
