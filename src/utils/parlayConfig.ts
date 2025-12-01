/**
 * Configuration constants for the parlay betting system
 */
export const PARLAY_CONFIG = {
  /** Minimum number of legs required for a parlay bet */
  MIN_LEGS: 2,
  
  /** Maximum number of legs allowed in a parlay bet */
  MAX_LEGS: 10,
  
  /** Maximum stake amount in tokens for any parlay bet */
  MAX_STAKE: 5000,
  
  /** House edge applied to parlay odds (5% = 0.05) */
  HOUSE_EDGE: 0.05,
} as const;

/**
 * Calculate the parlay multiplier after applying house edge
 * @param houseEdge - The house edge percentage (0.05 = 5%)
 * @returns The multiplier to apply to combined odds
 */
export const getParlayMultiplier = (houseEdge: number = PARLAY_CONFIG.HOUSE_EDGE): number => {
  return 1 - houseEdge;
};
