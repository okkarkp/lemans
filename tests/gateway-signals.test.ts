import { describe, expect, it } from "vitest";
import { signalsFromGatewayHeaders } from "@/server/domain/gateway-signals";

const h = (m: Record<string, string>) => new Headers(m);
const OFFICE = ["10.0.0.0/8"];

describe("signalsFromGatewayHeaders", () => {
  it("treats an office address with a compliant device as office + managed", () => {
    expect(signalsFromGatewayHeaders(h({ "x-forwarded-for": "10.2.3.4", "x-device-compliant": "true" }), OFFICE))
      .toMatchObject({ network: "OFFICE", deviceManaged: true });
  });
  it("uses the last hop, so a client-supplied office address in front is ignored", () => {
    expect(signalsFromGatewayHeaders(h({ "x-forwarded-for": "10.9.9.9, 203.0.113.7" }), OFFICE).network).toBe("REMOTE");
  });
  it("defaults to remote and unmanaged when headers are missing or not exactly true", () => {
    expect(signalsFromGatewayHeaders(h({}), OFFICE)).toMatchObject({ network: "REMOTE", deviceManaged: false });
    expect(signalsFromGatewayHeaders(h({ "x-device-compliant": "TRUE" }), OFFICE).deviceManaged).toBe(false);
  });
  it("is remote when no office ranges are configured", () => {
    expect(signalsFromGatewayHeaders(h({ "x-forwarded-for": "10.2.3.4" }), []).network).toBe("REMOTE");
  });
});
