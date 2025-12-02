/**
 * Configuration constants for the parlay betting system
 */
export const PARLAY_CONFIG = {
  /** Minimum number of legs required for a parlay bet (now 1 leg = winner + podium + highest) */
  MIN_LEGS: 1,
  
  /** Maximum number of legs allowed in a parlay bet (3 disciplines × 2 genders) */
  MAX_LEGS: 6,
  
  /** Maximum stake amount in tokens for any parlay bet */
  MAX_STAKE: 10000,
  
  /** House edge applied to parlay odds (0 for fixed multipliers) */
  HOUSE_EDGE: 0,
} as const;

/**
 * Fixed multiplier values for parlay bets
 */
export const PARLAY_MULTIPLIERS = {
  SINGLE_LEG: 20,
  SAME_DISCIPLINE_BOTH_GENDERS: 50,
  TWO_DISCIPLINES_ONE_GENDER: 50,
  TWO_DISCIPLINES_BOTH_GENDERS: 100,
  THREE_DISCIPLINES_ONE_GENDER: 100,
  THREE_DISCIPLINES_BOTH_GENDERS: 200,
} as const;

/**
 * Calculate the parlay multiplier after applying house edge
 * @param houseEdge - The house edge percentage (0.05 = 5%)
 * @returns The multiplier to apply to combined odds
 */
export const getParlayMultiplier = (houseEdge: number = PARLAY_CONFIG.HOUSE_EDGE): number => {
  return 1 - houseEdge;
};
