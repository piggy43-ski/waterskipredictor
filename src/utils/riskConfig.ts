/**
 * Risk configuration for house risk controls
 * 
 * OPTION A: Fixed Multipliers with Hard Exposure Caps
 * - Multipliers are computed before publish and DO NOT change during OPEN markets
 * - Hard exposure caps block bets (no odds shortening)
 * - House bankruptcy is mathematically impossible
 * 
 * CALIBRATION: Top-3 constraints ensure favorites have reasonable multipliers
 */

export const RISK_CONFIG = {
  /** Option A: Fixed Multiplier Mode (no live odds adjustments) */
  FIXED_MULTIPLIER_MODE: true,
  
  /** Allow live odds adjustment (false in Option A) */
  ALLOW_LIVE_ODDS_ADJUSTMENT: false,
  
  /** Maximum tokens per single entry */
  MAX_STAKE: 10000,
  
  /** Maximum payout per single entry */
  MAX_PAYOUT: 150000,
  
  /** Maximum % of market pool on one athlete (Option A hard cap) */
  MAX_ATHLETE_EXPOSURE_PCT: 0.30,
  
  /** Safety margin for pre-publish check (max payout must be ≤ this % of max pool) */
  PUBLISH_SAFETY_MARGIN: 0.95,
  
  /** Maximum % of user's tournament stake that can go to one athlete */
  MAX_ATHLETE_ALLOCATION_PCT: 0.25,
  
  /** Liability caps by market type (as % of market handle) - used for warnings */
  LIABILITY_CAPS: {
    WINNER: 0.35,
    PODIUM: 0.30,
    HIGHEST_SCORE: 0.30,
  } as const,
  
  /** Target implied sum bands by market type */
  IMPLIED_SUM_BANDS: {
    WINNER: { target: 0.909, min: 0.90, max: 0.915 },
    PODIUM: { target: 0.847, min: 0.84, max: 0.86 },
    HIGHEST_SCORE: { target: 0.877, min: 0.87, max: 0.89 },
  } as const,
  
  /** Maximum risk ratio by market type (caps house downside at 10-15%) */
  MAX_RISK_RATIO: {
    WINNER: 1.15,       // Max 15% downside
    PODIUM: 1.10,       // Max 10% downside
    HIGHEST_SCORE: 1.12 // Max 12% downside
  } as const,
  
  /** Compression rules (disabled in Option A during OPEN markets) */
  COMPRESSION: {
    /** Maximum single adjustment per update (8%) */
    MAX_ADJUSTMENT_PCT: 0.08,
    /** Minimum % of total tokens to be eligible for compression */
    MIN_EXPOSURE_PCT: 0.05,
    /** Multiplier floor (never compress below this) */
    MULTIPLIER_FLOOR: 1.20,
  } as const,
  
  /** 
   * CALIBRATION: Auto-calibrate probabilities to ensure reasonable multipliers
   * Uses PRIOR-DOMINANT model: 65% prior, 35% MC
   * Reduces temperature iteratively until top-3 constraints pass
   */
  CALIBRATION: {
    /** Initial temperature by market type */
    TEMPERATURE: {
      WINNER: 12,        // Higher = more spread across field
      HIGHEST_SCORE: 14, // Highest score needs more randomness
      PODIUM: 8,         // Podium is more forgiving
    } as const,
    /** Prior/MC blending factor: 0.35 = 35% MC, 65% prior (PRIOR DOMINATES!) */
    PRIOR_BLEND_ALPHA: 0.35,
    /** Temperature reduction per iteration (15%) */
    TEMP_REDUCTION_FACTOR: 0.85,
    /** Max calibration iterations before BLOCKING publish */
    MAX_ITERATIONS: 12,
  } as const,
  
  /**
   * TOP-3 MULTIPLIER CONSTRAINTS (REALISTIC for typical field sizes)
   * Based on probability math: 15 athletes, top-1 at 25% = 4.0x, top-2 at 18% = 5.5x
   * Only TOP-1 is strictly enforced; top-2/3 are relaxed as they depend on field distribution
   */
  TOP3_CONSTRAINTS: {
    WINNER: { top1Max: 4.0, top2Max: 10.0, top3Max: 15.0 },
    HIGHEST_SCORE: { top1Max: 5.0, top2Max: 12.0, top3Max: 15.0 },
    PODIUM: { top1Max: 2.5, top2Max: 4.0, top3Max: 6.0 },
  } as const,
  
  /**
   * HARD MULTIPLIER CAPS (backstop for longshots)
   * After calibration, compress any odds exceeding these
   */
  MULTIPLIER_CAPS: {
    WINNER: 20.0,
    HIGHEST_SCORE: 15.0,
    PODIUM: 10.0,
  } as const,
} as const;

export type MarketType = 'WINNER' | 'PODIUM' | 'HIGHEST_SCORE';

/**
 * Check if stake exceeds maximum
 */
export const isStakeOverMax = (stake: number): boolean => {
  return stake > RISK_CONFIG.MAX_STAKE;
};

/**
 * Check if payout exceeds maximum
 */
export const isPayoutOverMax = (stake: number, odds: number): boolean => {
  return stake * odds > RISK_CONFIG.MAX_PAYOUT;
};

/**
 * Calculate maximum stake for given odds to stay under payout cap
 */
export const getMaxStakeForOdds = (odds: number): number => {
  return Math.floor(RISK_CONFIG.MAX_PAYOUT / odds);
};

/**
 * Get payout cap warning threshold (80% of max)
 */
export const getPayoutWarningThreshold = (): number => {
  return RISK_CONFIG.MAX_PAYOUT * 0.8;
};

/**
 * Format risk validation error for display
 */
export const formatRiskError = (reason: string): string => {
  return reason;
};

/**
 * Get liability cap for a market type
 */
export const getLiabilityCap = (marketType: MarketType): number => {
  return RISK_CONFIG.LIABILITY_CAPS[marketType] || RISK_CONFIG.LIABILITY_CAPS.WINNER;
};

/**
 * Get max risk ratio for a market type
 */
export const getMaxRiskRatio = (marketType: MarketType): number => {
  return RISK_CONFIG.MAX_RISK_RATIO[marketType] || RISK_CONFIG.MAX_RISK_RATIO.WINNER;
};

/**
 * Get implied sum band for a market type
 */
export const getImpliedSumBand = (marketType: MarketType): { target: number; min: number; max: number } => {
  return RISK_CONFIG.IMPLIED_SUM_BANDS[marketType] || RISK_CONFIG.IMPLIED_SUM_BANDS.WINNER;
};

/**
 * Get top-3 multiplier constraints for a market type
 */
export const getTop3Constraints = (marketType: MarketType): { top1Max: number; top2Max: number; top3Max: number } => {
  return RISK_CONFIG.TOP3_CONSTRAINTS[marketType] || RISK_CONFIG.TOP3_CONSTRAINTS.WINNER;
};

/**
 * Get hard multiplier cap for a market type
 */
export const getMultiplierCap = (marketType: MarketType): number => {
  return RISK_CONFIG.MULTIPLIER_CAPS[marketType] || RISK_CONFIG.MULTIPLIER_CAPS.WINNER;
};

/**
 * Get initial temperature for a market type
 */
export const getInitialTemperature = (marketType: MarketType): number => {
  return RISK_CONFIG.CALIBRATION.TEMPERATURE[marketType] || RISK_CONFIG.CALIBRATION.TEMPERATURE.WINNER;
};

/**
 * Calculate compression factor needed to bring risk ratio within limits
 */
export const calculateCompressionFactor = (
  currentRiskRatio: number,
  maxRiskRatio: number
): number => {
  if (currentRiskRatio <= maxRiskRatio) return 1.0;
  return maxRiskRatio / currentRiskRatio;
};

/**
 * Apply max single adjustment cap to compression factor
 */
export const capCompressionAdjustment = (compressionFactor: number): number => {
  const minAllowed = 1 - RISK_CONFIG.COMPRESSION.MAX_ADJUSTMENT_PCT;
  return Math.max(compressionFactor, minAllowed);
};

/**
 * Check if an athlete has reached the exposure cap
 */
export const isAtExposureCap = (
  athleteTokens: number,
  totalMarketTokens: number
): boolean => {
  if (totalMarketTokens === 0) return false;
  return (athleteTokens / totalMarketTokens) >= RISK_CONFIG.MAX_ATHLETE_EXPOSURE_PCT;
};

/**
 * Calculate remaining capacity for an athlete before hitting exposure cap
 */
export const getRemainingCapacity = (
  currentAthleteTokens: number,
  totalMarketTokens: number,
  proposedStake: number = 0
): number => {
  const newTotal = totalMarketTokens + proposedStake;
  const maxAthleteTokens = newTotal * RISK_CONFIG.MAX_ATHLETE_EXPOSURE_PCT;
  return Math.max(0, Math.floor(maxAthleteTokens - currentAthleteTokens));
};

/**
 * Calculate the maximum possible payout for pre-publish safety check
 */
export const calculateMaxPossiblePayout = (
  multipliers: number[],
  totalPossiblePool: number
): number => {
  const maxExposurePerAthlete = totalPossiblePool * RISK_CONFIG.MAX_ATHLETE_EXPOSURE_PCT;
  const maxPayouts = multipliers.map(m => m * maxExposurePerAthlete);
  return Math.max(...maxPayouts, 0);
};

/**
 * Check if market passes pre-publish safety gate
 */
export const passesPrePublishSafetyCheck = (
  maxPossiblePayout: number,
  totalPossiblePool: number
): { passes: boolean; reason?: string } => {
  const safetyThreshold = totalPossiblePool * RISK_CONFIG.PUBLISH_SAFETY_MARGIN;
  
  if (maxPossiblePayout > safetyThreshold) {
    return {
      passes: false,
      reason: `Max possible payout (${maxPossiblePayout.toLocaleString()}) exceeds safety threshold (${safetyThreshold.toLocaleString()}). Adjust multipliers or limits.`
    };
  }
  
  return { passes: true };
};

/**
 * Check if multipliers pass top-3 constraints
 */
export const passesTop3Constraints = (
  sortedMultipliers: number[],
  marketType: MarketType
): { passes: boolean; details: { top1: number; top2: number; top3: number; constraints: { top1Max: number; top2Max: number; top3Max: number } } } => {
  const constraints = getTop3Constraints(marketType);
  const top1 = sortedMultipliers[0] || 99;
  const top2 = sortedMultipliers[1] || 99;
  const top3 = sortedMultipliers[2] || 99;
  
  const passes = top1 <= constraints.top1Max && top2 <= constraints.top2Max && top3 <= constraints.top3Max;
  
  return {
    passes,
    details: { top1, top2, top3, constraints }
  };
};
