import { describe, it, expect } from "vitest";
import { calculatePodiumCombinedMultiplier, getPodiumMultiplierConfig } from "../podiumMultipliers";
import { MAX_PODIUM_COMBINED_MULTIPLIER } from "../multiplierCaps";

describe("podiumMultipliers", () => {
  it("combined exact-order ≤ 18 even at max inputs", () => {
    const result = calculatePodiumCombinedMultiplier(6, 6, 6); // (18) * 2 = 36 → cap 18
    expect(result).toBeLessThanOrEqual(18);
    expect(result).toBe(MAX_PODIUM_COMBINED_MULTIPLIER);
  });

  it("computes sum × 2 below the cap", () => {
    const result = calculatePodiumCombinedMultiplier(2, 2, 2); // 6*2 = 12
    expect(result).toBe(12);
  });

  it("never exceeds 18 for any reasonable input", () => {
    for (let a = 1; a <= 8; a++) {
      for (let b = 1; b <= 8; b++) {
        for (let c = 1; c <= 8; c++) {
          expect(calculatePodiumCombinedMultiplier(a, b, c)).toBeLessThanOrEqual(18);
        }
      }
    }
  });

  it("config exposes maxMultiplier = 18", () => {
    expect(getPodiumMultiplierConfig().maxMultiplier).toBe(18);
  });
});