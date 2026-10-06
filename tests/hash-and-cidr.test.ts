import { describe, expect, it } from "vitest";
import { canonicalJson, GENESIS_HASH, ledgerHash, verifyChain } from "@/server/domain/hash";
import { inCidr } from "@/server/domain/cidr";

function chain(n: number) {
  const out = [];
  let prev = GENESIS_HASH;
  for (let seq = 1; seq <= n; seq++) {
    const e = { seq, occurredAt: `2026-09-0${seq}T01:00:00.000Z`, actorId: "u", eventType: "CHECK_IN", payload: { seq, b: 1, a: 2 }, prevHash: prev };
    const hash = ledgerHash(e);
    out.push({ ...e, hash });
    prev = hash;
  }
  return out;
}

describe("ledger hash chain", () => {
  it("is independent of key order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });
  it("verifies an intact chain", () => {
    expect(verifyChain(chain(5))).toEqual({ ok: true });
  });
  it("detects an edited payload", () => {
    const c = chain(5);
    c[2].payload.b = 99;
    expect(verifyChain(c)).toEqual({ ok: false, brokenAt: 3 });
  });
  it("detects a deleted entry", () => {
    const c = chain(5);
    c.splice(1, 1);
    expect(verifyChain(c)).toEqual({ ok: false, brokenAt: 3 });
  });
});

describe("inCidr", () => {
  it("matches addresses inside the range", () => {
    expect(inCidr("10.20.30.40", "10.0.0.0/8")).toBe(true);
    expect(inCidr("::ffff:10.1.1.1", "10.0.0.0/8")).toBe(true);
    expect(inCidr("192.168.1.130", "192.168.1.128/25")).toBe(true);
  });
  it("rejects addresses outside the range and malformed input", () => {
    expect(inCidr("11.0.0.1", "10.0.0.0/8")).toBe(false);
    expect(inCidr("192.168.1.10", "192.168.1.128/25")).toBe(false);
    expect(inCidr("not-an-ip", "10.0.0.0/8")).toBe(false);
    expect(inCidr("10.0.0.1", "10.0.0.0/33")).toBe(false);
  });
});

describe("verifyChain input shape", () => {
  it("fails if non-hashed metadata is passed through, so callers must map fields explicitly", () => {
    const c = chain(2).map((e) => ({ ...e, recordedAt: "2026-09-01T00:00:00.000Z" }));
    expect(verifyChain(c).ok).toBe(false);
  });
});
