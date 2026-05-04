import { describe, it, expect } from "vitest";
import {
  validateMultiplier,
  MULTIPLIER_CAPS,
  RANK_CAPS,
  MAX_PODIUM_COMBINED_MULTIPLIER,
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
    it("rejects WINNER above hard cap 8.0x at any rank", () => {
      expect(validateMultiplier("WINNER", 8.01, 99).valid).toBe(false);
      expect(MULTIPLIER_CAPS.WINNER.max).toBe(8.0);
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
    it("rejects rank-3 PODIUM > 2.25x", () => {
      expect(validateMultiplier("PODIUM", 2.26, 3).valid).toBe(false);
    });
    it("hard cap PODIUM = 6.0x", () => {
      expect(MULTIPLIER_CAPS.PODIUM.max).toBe(6.0);
      expect(validateMultiplier("PODIUM", 6.01, 99).valid).toBe(false);
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
    it("rejects rank-3 HIGHEST_SCORE > 3.5x", () => {
      expect(validateMultiplier("HIGHEST_SCORE", 3.51, 3).valid).toBe(false);
    });
    it("hard cap HIGHEST_SCORE = 7.0x", () => {
      expect(MULTIPLIER_CAPS.HIGHEST_SCORE.max).toBe(7.0);
      expect(validateMultiplier("HIGHEST_SCORE", 7.01, 99).valid).toBe(false);
    });
  });

  it("RANK_CAPS values match canonical spec", () => {
    expect(RANK_CAPS.WINNER[1]).toBe(1.5);
    expect(RANK_CAPS.WINNER[2]).toBe(2.25);
    expect(RANK_CAPS.WINNER[3]).toBe(3.0);
    expect(RANK_CAPS.PODIUM[1]).toBe(1.25);
    expect(RANK_CAPS.PODIUM[2]).toBe(1.75);
    expect(RANK_CAPS.PODIUM[3]).toBe(2.25);
    expect(RANK_CAPS.HIGHEST_SCORE[1]).toBe(1.8);
    expect(RANK_CAPS.HIGHEST_SCORE[2]).toBe(2.5);
    expect(RANK_CAPS.HIGHEST_SCORE[3]).toBe(3.5);
  });

  it("MAX_PODIUM_COMBINED_MULTIPLIER = 18", () => {
    expect(MAX_PODIUM_COMBINED_MULTIPLIER).toBe(18);
  });
});