/** Leave types that draw on an annual entitlement. "OTHER" (for example unpaid) has no balance. */
export const BALANCED_TYPES = ["ANNUAL", "MEDICAL", "CHILDCARE"] as const;
export type BalancedType = (typeof BALANCED_TYPES)[number];

/**
 * Applied when no entitlement has been set for a person and year. These are placeholders to be
 * confirmed against the contract and each person's terms; administrators override per person.
 */
export const DEFAULT_ENTITLEMENT: Record<BalancedType, number> = { ANNUAL: 18, MEDICAL: 14, CHILDCARE: 6 };

export interface Balance { leaveType: BalancedType; entitled: number; approved: number; pending: number; remaining: number; isDefault: boolean }

export function computeBalance(leaveType: BalancedType, entitled: number | null, approved: number, pending: number): Balance {
  const e = entitled ?? DEFAULT_ENTITLEMENT[leaveType];
  return { leaveType, entitled: e, approved, pending, remaining: round1(e - approved - pending), isDefault: entitled === null };
}

export const round1 = (x: number) => Math.round(x * 10) / 10;
export const isBalanced = (t: string): t is BalancedType => (BALANCED_TYPES as readonly string[]).includes(t);
