import { describe, it, expect } from "vitest";
import {
  validateMultiplier,
  MULTIPLIER_CAPS,
  RANK_CAPS,
  MAX_PODIUM_COMBINED_MULTIPLIER,
  getRankCap,
} from "../multiplierCaps";

describe("multiplierCaps - rank caps", () => {
  describe("WINNER", () => {
    it("rejects rank-1 WINNER > 1.5x", () => {
      expect(validateMultiplier("WINNER", 1.51, 1).valid).toBe(false);
      expect(validateMultiplier("WINNER", 1.5, 1).valid).toBe(true);
    });
    it("rejects rank-2 WINNER > 2.25x", () => {
      expect(validateMultiplier("WINNER", 2.26, 2).valid).toBe(false);
      expect(validateMultiplier("WINNER", 2.25, 2).valid).toBe(true);
    });
    it("rejects rank-3 WINNER > 3.0x", () => {
      expect(validateMultiplier("WINNER", 3.01, 3).valid).toBe(false);
      expect(validateMultiplier("WINNER", 3.0, 3).valid).toBe(true);
    });
    it("rejects WINNER above hard cap 25.0x at any rank", () => {
      expect(validateMultiplier("WINNER", 25.01, 99).valid).toBe(false);
      expect(MULTIPLIER_CAPS.WINNER.max).toBe(25.0);
    });
    it("WINNER rank 4–7 tier cap = 5.0", () => {
      expect(getRankCap("WINNER", 4)).toBe(5.0);
      expect(getRankCap("WINNER", 7)).toBe(5.0);
      expect(validateMultiplier("WINNER", 5.01, 4).valid).toBe(false);
      expect(validateMultiplier("WINNER", 5.0, 7).valid).toBe(true);
    });
    it("WINNER rank 8+ tier cap = 20.0", () => {
      expect(getRankCap("WINNER", 8)).toBe(20.0);
      expect(getRankCap("WINNER", 25)).toBe(20.0);
      expect(validateMultiplier("WINNER", 20.01, 12).valid).toBe(false);
      expect(validateMultiplier("WINNER", 20.0, 15).valid).toBe(true);
    });
  });

  describe("PODIUM", () => {
    it("rejects rank-1 PODIUM > 1.25x", () => {
      expect(validateMultiplier("PODIUM", 1.26, 1).valid).toBe(false);
      expect(validateMultiplier("PODIUM", 1.25, 1).valid).toBe(true);
    });
    it("rejects rank-2 PODIUM > 1.75x", () => {
      expect(validateMultiplier("PODIUM", 1.76, 2).valid).toBe(false);
    });
    it("rejects rank-3 PODIUM > 2.2x", () => {
      expect(validateMultiplier("PODIUM", 2.21, 3).valid).toBe(false);
      expect(validateMultiplier("PODIUM", 2.2, 3).valid).toBe(true);
    });
    it("PODIUM tier caps: 4-7 = 4.0, 8+ = 10.0", () => {
      expect(getRankCap("PODIUM", 5)).toBe(4.0);
      expect(getRankCap("PODIUM", 10)).toBe(10.0);
    });
    it("hard cap PODIUM = 12.0x", () => {
      expect(MULTIPLIER_CAPS.PODIUM.max).toBe(12.0);
      expect(validateMultiplier("PODIUM", 12.01, 99).valid).toBe(false);
    });
  });

  describe("HIGHEST_SCORE", () => {
    it("rejects rank-1 HIGHEST_SCORE > 1.8x", () => {
      expect(validateMultiplier("HIGHEST_SCORE", 1.81, 1).valid).toBe(false);
      expect(validateMultiplier("HIGHEST_SCORE", 1.8, 1).valid).toBe(true);
    });
    it("rejects rank-2 HIGHEST_SCORE > 2.5x", () => {
      expect(validateMultiplier("HIGHEST_SCORE", 2.51, 2).valid).toBe(false);
    });
    it("rejects rank-3 HIGHEST_SCORE > 3.4x", () => {
      expect(validateMultiplier("HIGHEST_SCORE", 3.41, 3).valid).toBe(false);
      expect(validateMultiplier("HIGHEST_SCORE", 3.4, 3).valid).toBe(true);
    });
    it("HIGHEST_SCORE tier caps: 4-7 = 5.5, 8+ = 18.0", () => {
      expect(getRankCap("HIGHEST_SCORE", 6)).toBe(5.5);
      expect(getRankCap("HIGHEST_SCORE", 9)).toBe(18.0);
    });
    it("hard cap HIGHEST_SCORE = 22.0x", () => {
      expect(MULTIPLIER_CAPS.HIGHEST_SCORE.max).toBe(22.0);
      expect(validateMultiplier("HIGHEST_SCORE", 22.01, 99).valid).toBe(false);
    });
  });

  it("RANK_CAPS values match canonical tiered spec", () => {
    expect(RANK_CAPS.WINNER[1]).toBe(1.5);
    expect(RANK_CAPS.WINNER[2]).toBe(2.25);
    expect(RANK_CAPS.WINNER[3]).toBe(3.0);
    expect(RANK_CAPS.WINNER['4-7']).toBe(5.0);
    expect(RANK_CAPS.WINNER['8+']).toBe(20.0);
    expect(RANK_CAPS.PODIUM[1]).toBe(1.25);
    expect(RANK_CAPS.PODIUM[2]).toBe(1.75);
    expect(RANK_CAPS.PODIUM[3]).toBe(2.2);
    expect(RANK_CAPS.PODIUM['4-7']).toBe(4.0);
    expect(RANK_CAPS.PODIUM['8+']).toBe(10.0);
    expect(RANK_CAPS.HIGHEST_SCORE[1]).toBe(1.8);
    expect(RANK_CAPS.HIGHEST_SCORE[2]).toBe(2.5);
    expect(RANK_CAPS.HIGHEST_SCORE[3]).toBe(3.4);
    expect(RANK_CAPS.HIGHEST_SCORE['4-7']).toBe(5.5);
    expect(RANK_CAPS.HIGHEST_SCORE['8+']).toBe(18.0);
  });

  it("MAX_PODIUM_COMBINED_MULTIPLIER = 25", () => {
    expect(MAX_PODIUM_COMBINED_MULTIPLIER).toBe(25);
  });
});