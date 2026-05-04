import { describe, it, expect } from "vitest";
import { validateReverseSettlementArgs } from "../reverse";

describe("validateReverseSettlementArgs (XOR + reason)", () => {
  it("ok in run-id mode", () => {
    const v = validateReverseSettlementArgs({ runId: "r1", reason: "fix" });
    expect(v).toEqual({ ok: true, mode: "run" });
  });

  it("ok in slip-id mode", () => {
    const v = validateReverseSettlementArgs({ slipId: "s1", reason: "fix" });
    expect(v).toEqual({ ok: true, mode: "slip" });
  });

  it("rejects when both are supplied", () => {
    const v = validateReverseSettlementArgs({ runId: "r1", slipId: "s1", reason: "fix" });
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/XOR/);
  });

  it("rejects when neither is supplied", () => {
    const v = validateReverseSettlementArgs({ reason: "fix" });
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/XOR/);
  });

  it("rejects empty / missing reason", () => {
    expect(validateReverseSettlementArgs({ runId: "r1" }).ok).toBe(false);
    expect(validateReverseSettlementArgs({ runId: "r1", reason: "" }).ok).toBe(false);
    expect(validateReverseSettlementArgs({ runId: "r1", reason: "   " }).ok).toBe(false);
  });
});