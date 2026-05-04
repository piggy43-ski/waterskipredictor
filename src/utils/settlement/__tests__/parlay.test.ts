import { describe, it, expect } from "vitest";
import { resolveParlay, pendingLegsBlockingWon, type ParlayLeg } from "../parlay";

const leg = (id: string, status: ParlayLeg["status"]): ParlayLeg => ({ id, status });

describe("resolveParlay", () => {
  it("LOST when any leg is LOST; pending siblings become VOID (not LOST)", () => {
    const r = resolveParlay([leg("a", "LOST"), leg("b", "PENDING"), leg("c", "WON")]);
    expect(r.resolution).toBe("LOST");
    expect(r.legUpdates).toEqual([{ id: "b", from: "PENDING", to: "VOID" }]);
  });

  it("WON when every leg is WON or VOID", () => {
    const r = resolveParlay([leg("a", "WON"), leg("b", "VOID"), leg("c", "WON")]);
    expect(r.resolution).toBe("WON");
    expect(r.legUpdates).toEqual([]);
  });

  it("PENDING when no LOST and at least one PENDING leg", () => {
    const r = resolveParlay([leg("a", "WON"), leg("b", "PENDING")]);
    expect(r.resolution).toBe("PENDING");
    expect(r.legUpdates).toEqual([]);
  });

  it("multiple pending siblings on a LOST slip all flip to VOID", () => {
    const r = resolveParlay([
      leg("a", "PENDING"),
      leg("b", "LOST"),
      leg("c", "PENDING"),
      leg("d", "PENDING"),
    ]);
    expect(r.resolution).toBe("LOST");
    expect(r.legUpdates.map((u) => u.id).sort()).toEqual(["a", "c", "d"]);
    expect(r.legUpdates.every((u) => u.to === "VOID")).toBe(true);
  });

  it("empty leg list does not resolve", () => {
    const r = resolveParlay([]);
    expect(r.resolution).toBe("PENDING");
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe("pendingLegsBlockingWon (slip cannot resolve WON while any leg is PENDING)", () => {
  it("reports pending legs as blockers", () => {
    expect(
      pendingLegsBlockingWon([leg("a", "WON"), leg("b", "PENDING"), leg("c", "PENDING")]),
    ).toEqual(["b", "c"]);
  });

  it("returns empty when no pending legs remain", () => {
    expect(pendingLegsBlockingWon([leg("a", "WON"), leg("b", "VOID")])).toEqual([]);
  });

  it("invariant: a WON-resolved slip never leaves PENDING legs behind", () => {
    const legs = [leg("a", "WON"), leg("b", "VOID"), leg("c", "WON")];
    const r = resolveParlay(legs);
    if (r.resolution === "WON") {
      // After applying the (empty) updates, no leg is PENDING.
      const after = legs.map((l) => {
        const u = r.legUpdates.find((x) => x.id === l.id);
        return u ? { ...l, status: u.to } : l;
      });
      expect(pendingLegsBlockingWon(after)).toEqual([]);
    }
  });
});