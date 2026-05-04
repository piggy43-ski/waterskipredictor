import { describe, it, expect } from "vitest";
import { resolveParlay, type ParlayLeg } from "../parlay";
import { buildCreditIdempotencyKey } from "../idempotency";

const leg = (id: string, status: ParlayLeg["status"]): ParlayLeg => ({ id, status });

/**
 * Integration-style: compose resolveParlay + buildCreditIdempotencyKey to mirror
 * the live settle-predictions flow without touching a DB.
 * Contract: a credit ledger key is built ONLY when the slip resolves WON.
 */
function settleSlip(slipId: string, userId: string, legs: ParlayLeg[]) {
  const r = resolveParlay(legs);
  const creditKey =
    r.resolution === "WON"
      ? buildCreditIdempotencyKey({
          userId,
          referenceType: "entry",
          referenceId: slipId,
          type: "prediction_won",
        })
      : null;
  return { resolution: r.resolution, legUpdates: r.legUpdates, creditKey };
}

describe("integration: resolveParlay + idempotency on 5-leg parlays", () => {
  it("all-WON → slip WON, credit key built, no leg updates", () => {
    const out = settleSlip("s1", "u1", ["a","b","c","d","e"].map(i => leg(i, "WON")));
    expect(out.resolution).toBe("WON");
    expect(out.legUpdates).toEqual([]);
    expect(out.creditKey).toBe("u1|entry|s1|prediction_won");
  });

  it("one-LOST → slip LOST, no credit key, pending siblings → VOID", () => {
    const out = settleSlip("s2", "u1", [
      leg("a","WON"), leg("b","LOST"), leg("c","PENDING"), leg("d","PENDING"), leg("e","WON"),
    ]);
    expect(out.resolution).toBe("LOST");
    expect(out.creditKey).toBeNull();
    expect(out.legUpdates.map(u => u.id).sort()).toEqual(["c","d"]);
    expect(out.legUpdates.every(u => u.to === "VOID")).toBe(true);
  });

  it("all-PENDING → slip PENDING, no credit key, no updates", () => {
    const out = settleSlip("s3", "u1", ["a","b","c","d","e"].map(i => leg(i, "PENDING")));
    expect(out.resolution).toBe("PENDING");
    expect(out.creditKey).toBeNull();
    expect(out.legUpdates).toEqual([]);
  });

  it("mixed WON+VOID (no LOST, no PENDING) → slip WON, credit key built", () => {
    const out = settleSlip("s4", "u1", [
      leg("a","WON"), leg("b","VOID"), leg("c","WON"), leg("d","VOID"), leg("e","WON"),
    ]);
    expect(out.resolution).toBe("WON");
    expect(out.creditKey).toBe("u1|entry|s4|prediction_won");
    expect(out.legUpdates).toEqual([]);
  });

  it("LOST+all-other-WON → siblings already settled, slip LOST, no extra updates", () => {
    const out = settleSlip("s5", "u1", [
      leg("a","WON"), leg("b","WON"), leg("c","LOST"), leg("d","WON"), leg("e","VOID"),
    ]);
    expect(out.resolution).toBe("LOST");
    expect(out.creditKey).toBeNull();
    expect(out.legUpdates).toEqual([]);
  });
});