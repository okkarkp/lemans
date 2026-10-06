import { describe, expect, it } from "vitest";
import { evaluateCheckIn, type TrustSignals } from "@/server/domain/checkin-policy";

const sig = (deviceManaged: boolean, network: "OFFICE" | "REMOTE"): TrustSignals => ({ deviceManaged, network, deviceLabel: "d", networkLabel: "n" });

describe("evaluateCheckIn", () => {
  it("accepts office with a managed device as strong evidence", () => {
    expect(evaluateCheckIn("OFFICE", sig(true, "OFFICE"))).toEqual({ accepted: true, location: "OFFICE", strength: "STRONG" });
  });
  it("accepts office on a personal phone as medium evidence", () => {
    expect(evaluateCheckIn("OFFICE", sig(false, "OFFICE"))).toMatchObject({ accepted: true, strength: "MEDIUM" });
  });
  it("accepts WFH from a managed device off the office network", () => {
    expect(evaluateCheckIn("WFH", sig(true, "REMOTE"))).toMatchObject({ accepted: true, location: "WFH", strength: "STRONG" });
  });
  it("rejects WFH from an unmanaged device", () => {
    expect(evaluateCheckIn("WFH", sig(false, "REMOTE"))).toMatchObject({ accepted: false, code: "UNMANAGED_DEVICE_REMOTE" });
  });
  it("rejects office when the request is not from the office network", () => {
    expect(evaluateCheckIn("OFFICE", sig(true, "REMOTE"))).toMatchObject({ accepted: false, code: "OFFICE_NOT_ON_OFFICE_NETWORK" });
  });
  it("rejects WFH declared from the office network", () => {
    expect(evaluateCheckIn("WFH", sig(true, "OFFICE"))).toMatchObject({ accepted: false, code: "WFH_ON_OFFICE_NETWORK" });
  });
});
