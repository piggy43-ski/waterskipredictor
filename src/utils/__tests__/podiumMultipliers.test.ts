import { describe, it, expect } from "vitest";
import { calculatePodiumCombinedMultiplier, getPodiumMultiplierConfig } from "../podiumMultipliers";
import { MAX_PODIUM_EXACT_ORDER_MULTIPLIER } from "../multiplierCaps";

describe("podiumMultipliers (formula fallback)", () => {
  it("formula = sum × 1 (order-blind sum × 2 inflation removed)", () => {
    expect(calculatePodiumCombinedMultiplier(2, 2, 2)).toBe(6);
  });

  it("capped at MAX_PODIUM_EXACT_ORDER_MULTIPLIER", () => {
    expect(calculatePodiumCombinedMultiplier(80, 80, 80)).toBe(MAX_PODIUM_EXACT_ORDER_MULTIPLIER);
  });

  it("never exceeds the exact-order cap for any reasonable input", () => {
    for (let a = 1; a <= 8; a++) {
      for (let b = 1; b <= 8; b++) {
        for (let c = 1; c <= 8; c++) {
          expect(calculatePodiumCombinedMultiplier(a, b, c)).toBeLessThanOrEqual(
            MAX_PODIUM_EXACT_ORDER_MULTIPLIER
          );
        }
      }
    }
  });

  it("config exposes the new exact-order cap and bonus factor 1", () => {
    const cfg = getPodiumMultiplierConfig();
    expect(cfg.maxMultiplier).toBe(MAX_PODIUM_EXACT_ORDER_MULTIPLIER);
    expect(cfg.bonusFactor).toBe(1);
  });
});