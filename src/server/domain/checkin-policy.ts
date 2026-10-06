/**
 * Decides whether a check-in is accepted, using trust signals the server observed - never
 * what the client claims about itself. See docs/ARCHITECTURE.md, "Check-in evidence".
 */
export type Location = "OFFICE" | "WFH";
export type Network = "OFFICE" | "REMOTE";
export type EvidenceStrength = "STRONG" | "MEDIUM";

export interface TrustSignals {
  deviceManaged: boolean;
  deviceLabel: string;
  network: Network;
  networkLabel: string;
}

export type CheckInDecision =
  | { accepted: true; location: Location; strength: EvidenceStrength }
  | { accepted: false; code: "UNMANAGED_DEVICE_REMOTE" | "OFFICE_NOT_ON_OFFICE_NETWORK" | "WFH_ON_OFFICE_NETWORK"; message: string };

export function evaluateCheckIn(declared: Location, signals: TrustSignals): CheckInDecision {
  if (declared === "OFFICE" && signals.network !== "OFFICE") {
    return { accepted: false, code: "OFFICE_NOT_ON_OFFICE_NETWORK", message: "You selected IRAS office, but this request did not come from the IRAS office network." };
  }
  if (declared === "WFH" && signals.network === "OFFICE") {
    return { accepted: false, code: "WFH_ON_OFFICE_NETWORK", message: "You selected work from home, but this request came from the IRAS office network. Select IRAS office instead." };
  }
  if (declared === "WFH" && !signals.deviceManaged) {
    return { accepted: false, code: "UNMANAGED_DEVICE_REMOTE", message: "Work-from-home check-in must be made from a managed WOG device." };
  }
  // Office network alone is medium evidence; a managed device on top of it is strong.
  return { accepted: true, location: declared, strength: signals.deviceManaged ? "STRONG" : "MEDIUM" };
}
