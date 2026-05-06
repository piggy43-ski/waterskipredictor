import { describe, it, expect } from "vitest";
import {
  calculateParlayMultiplier,
  calculateProgressiveCap,
  getMaxParlayLegs,
} from "../parlayMultipliers";
import type { ParlayLeg } from "@/types/parlay";

const EXPECTED_CAPS: Record<number, number> = {
  1: 15, 2: 20, 3: 35, 4: 50, 5: 75, 6: 100, 7: 130, 8: 160,
};

function makeLeg(odds: number): ParlayLeg {
  const sel = { decimal_odds: odds } as any;
  return {
    discipline: "slalom" as any,
    gender: "men",
    category: "open_men" as any,
    winner: sel,
    podium: { first: null, second: null, third: null },
    highestScore: null,
    isComplete: true,
  };
}

describe("parlayMultipliers — extended caps (5-8 legs)", () => {
  it("MAX_PARLAY_LEGS is now 8", () => {
    expect(getMaxParlayLegs()).toBe(8);
  });

  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`progressive cap for ${n} legs = ${EXPECTED_CAPS[n]}x`, () => {
      expect(calculateProgressiveCap(n)).toBe(EXPECTED_CAPS[n]);
    });
  }

  it("9+ legs are disabled (cap = 0)", () => {
    expect(calculateProgressiveCap(9)).toBe(0);
  });

  // Brute-force: final multiplier never exceeds the cap, even with max legitimate
  // per-leg odds (8.0 = WINNER hard cap).
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`final multiplier never exceeds cap for ${n} legs (brute-force odds 1.0–8.0)`, () => {
      for (let odds = 1.0; odds <= 8.0; odds += 0.5) {
        const legs = Array.from({ length: n }, () => makeLeg(odds));
        const mult = calculateParlayMultiplier(legs);
        expect(mult).toBeLessThanOrEqual(EXPECTED_CAPS[n] + 1e-9);
      }
    });
  }

  it("9-leg parlay returns 0 (disabled)", () => {
    const legs = Array.from({ length: 9 }, () => makeLeg(2.0));
    expect(calculateParlayMultiplier(legs)).toBe(0);
  });
});