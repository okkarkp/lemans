import type { IsoDate } from "./calendar";

export type DayStatus = "NOT_ASSIGNED" | "WORKED" | "LEAVE" | "CORRECTED_WORKED" | "CORRECTED_LEAVE" | "GAP" | "AWAITING" | "NON_WORKING";

export interface DayFacts {
  attended: boolean;
  onApprovedLeave: boolean;
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
  if (facts.attended) return "WORKED";
  if (facts.onApprovedLeave) return "LEAVE";
  if (facts.correction === "WORKED") return "CORRECTED_WORKED";
  if (facts.correction === "LEAVE") return "CORRECTED_LEAVE";
  if (date < ctx.today || (date === ctx.today && ctx.alertPassed)) return "GAP";
  return "AWAITING";
}

export const isBillable = (s: DayStatus) => s === "WORKED" || s === "CORRECTED_WORKED";
export const isLeave = (s: DayStatus) => s === "LEAVE" || s === "CORRECTED_LEAVE";
