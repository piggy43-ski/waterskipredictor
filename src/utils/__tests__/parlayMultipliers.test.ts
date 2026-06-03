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

  it("Model A: drops Winner when Podium is picked in the same leg", () => {
    const sel = (odds: number) =>
      ({ decimal_odds: odds, athlete_id: "a", athlete: { name: "x" }, market_id: "m" } as any);
    const leg1: ParlayLeg = {
      discipline: "slalom" as any,
      gender: "men",
      category: "open_men" as any,
      winner: sel(1.5),
      podium: { first: sel(1), second: sel(1), third: sel(1) },
      podiumMultiplier: 7.25,
      highestScore: sel(3.0),
      isComplete: true,
    };
    const leg2: ParlayLeg = {
      discipline: "slalom" as any,
      gender: "women",
      category: "open_women" as any,
      winner: sel(1.2),
      podium: { first: sel(1), second: sel(1), third: sel(1) },
      podiumMultiplier: 11.45,
      highestScore: sel(1.4),
      isComplete: true,
    };
    // Winner dropped (implied by Podium):
    // leg1 = 7.25 + 3.00 = 10.25 ; leg2 = 11.45 + 1.40 = 12.85
    // raw = 131.7125 ; * 0.75 ≈ 98.78
    expect(calculateRawParlayMultiplier([leg1, leg2])).toBeCloseTo(131.7125, 3);
    expect(calculateParlayMultiplier([leg1, leg2])).toBeCloseTo(98.784375, 3);
  });

  it("Model A: keeps Winner when Podium is NOT picked (Winner + Highest)", () => {
    const sel = (odds: number) =>
      ({ decimal_odds: odds, athlete_id: "a", athlete: { name: "x" }, market_id: "m" } as any);
    const leg: ParlayLeg = {
      discipline: "slalom" as any,
      gender: "men",
      category: "open_men" as any,
      winner: sel(2.0),
      podium: { first: null, second: null, third: null },
      highestScore: sel(3.0),
      isComplete: true,
    };
    // sum 2 + 3 = 5
    expect(calculateRawParlayMultiplier([leg])).toBeCloseTo(5, 5);
  });
});