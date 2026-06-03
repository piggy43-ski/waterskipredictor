import { describe, it, expect } from "vitest";
import {
  calculateParlayMultiplier,
  calculateRawParlayMultiplier,
} from "../parlayMultipliers";
import type { ParlayLeg } from "@/types/parlay";

function winnerLeg(odds: number): ParlayLeg {
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

function podiumLeg(combined: number): ParlayLeg {
  const sel = { decimal_odds: 1, athlete_id: "a", athlete: { name: "x" }, market_id: "m" } as any;
  return {
    discipline: "slalom" as any,
    gender: "men",
    category: "open_men" as any,
    winner: null,
    podium: { first: sel, second: sel, third: sel },
    podiumMultiplier: combined,
    highestScore: null,
    isComplete: true,
  };
}

describe("parlayMultipliers — uncapped product × haircut", () => {
  it("single winner leg: odds × 0.75 floored at 1", () => {
    expect(calculateParlayMultiplier([winnerLeg(2)])).toBeCloseTo(1.5, 5);
    expect(calculateParlayMultiplier([winnerLeg(1.1)])).toBe(1); // floor
  });

  it("stacks winners multiplicatively", () => {
    const legs = [winnerLeg(2), winnerLeg(3), winnerLeg(4)];
    expect(calculateRawParlayMultiplier(legs)).toBeCloseTo(24, 5);
    expect(calculateParlayMultiplier(legs)).toBeCloseTo(18, 5);
  });

  it("podium contributes ONE combined factor, not first×second×third", () => {
    const legs = [winnerLeg(2), podiumLeg(7)];
    expect(calculateRawParlayMultiplier(legs)).toBeCloseTo(14, 5);
    expect(calculateParlayMultiplier(legs)).toBeCloseTo(10.5, 5);
  });

  it("no progressive leg-count cap — 10 legs computes raw × 0.75", () => {
    const legs = Array.from({ length: 10 }, () => winnerLeg(2));
    expect(calculateParlayMultiplier(legs)).toBeCloseTo(1024 * 0.75, 3);
  });
});