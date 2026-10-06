import { inAnyCidr } from "./cidr";
import type { TrustSignals } from "./checkin-policy";

/**
 * Derives check-in evidence from headers set by the agency gateway. Assumes the gateway
 * overwrites X-Forwarded-For (the last hop is the address it saw) and sets X-Device-Compliant
 * from its own device-posture check; a client cannot reach the app without passing through it.
 */
export function signalsFromGatewayHeaders(h: { get(name: string): string | null }, officeCidrs: string[]): TrustSignals {
  const ip = (h.get("x-forwarded-for") ?? "").split(",").at(-1)?.trim() ?? "";
  const onOffice = ip !== "" && inAnyCidr(ip, officeCidrs);
  const managed = h.get("x-device-compliant") === "true";
  return {
    deviceManaged: managed,
    deviceLabel: managed ? "Managed WOG device" : "Unmanaged device",
    network: onOffice ? "OFFICE" : "REMOTE",
    networkLabel: onOffice ? "IRAS office network" : "Remote network",
  };
}
