import "server-only";
import { cookies, headers } from "next/headers";
import { config, splitList } from "../config";
import { signalsFromGatewayHeaders } from "../domain/gateway-signals";
import type { TrustSignals } from "../domain/checkin-policy";

/**
 * Where the check-in evidence comes from. The policy (domain/checkin-policy) never changes; only
 * this provider does when moving from demo to a real deployment.
 */
export async function resolveTrustSignals(): Promise<TrustSignals> {
  return config().DEMO_MODE ? demoSignals() : gatewaySignals();
}

export const DEMO_SIGNALS_COOKIE = "lemans_demo_signals";
export type DemoDevice = "WOG_LAPTOP" | "PERSONAL_PHONE";
export type DemoNetwork = "OFFICE" | "REMOTE";

export async function readDemoSignals(): Promise<{ device: DemoDevice; network: DemoNetwork }> {
  const raw = (await cookies()).get(DEMO_SIGNALS_COOKIE)?.value ?? "";
  const [device, network] = raw.split("|");
  return {
    device: device === "PERSONAL_PHONE" ? "PERSONAL_PHONE" : "WOG_LAPTOP",
    network: network === "REMOTE" ? "REMOTE" : "OFFICE",
  };
}

async function demoSignals(): Promise<TrustSignals> {
  const s = await readDemoSignals();
  return {
    deviceManaged: s.device === "WOG_LAPTOP",
    deviceLabel: s.device === "WOG_LAPTOP" ? "WOG laptop (managed, simulated)" : "Personal phone (unmanaged, simulated)",
    network: s.network,
    networkLabel: s.network === "OFFICE" ? "IRAS office network (simulated)" : "Remote network (simulated)",
  };
}

async function gatewaySignals(): Promise<TrustSignals> {
  return signalsFromGatewayHeaders(await headers(), splitList(config().OFFICE_CIDRS));
}
