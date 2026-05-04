import { describe, it, expect } from "vitest";
import { deriveMultipliers, MULTIPLIER_CONFIG } from "../multiplierUtils";

function makeProbs(n: number): number[] {
  // Decreasing probabilities summing roughly to 1
  const raw = Array.from({ length: n }, (_, i) => 1 / (i + 2));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((p) => p / sum);
}

describe("deriveMultipliers - strict caps regardless of fieldSize", () => {
  const markets = ["WINNER", "PODIUM", "HIGHEST_SCORE"] as const;

  for (const market of markets) {
    const cap = MULTIPLIER_CONFIG.MULTIPLIER_CAPS[market].max;

    for (const fieldSize of [4, 8, 16, 24, 40]) {
      it(`${market} fieldSize=${fieldSize}: every multiplier ≤ caps.max (${cap})`, () => {
        const probs = makeProbs(fieldSize);
        const { multipliers } = deriveMultipliers(probs, market, fieldSize);
        for (const m of multipliers) {
          expect(m).toBeLessThanOrEqual(cap + 1e-9);
        }
      });
    }

    it(`${market} with tiny probabilities still respects cap`, () => {
      const probs = Array(20).fill(0.0001);
      const { multipliers } = deriveMultipliers(probs, market, 20);
      for (const m of multipliers) {
        expect(m).toBeLessThanOrEqual(cap + 1e-9);
      }
    });
  }
});