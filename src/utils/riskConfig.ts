/**
 * Risk Configuration
 * 
 * Centralized configuration for house safety, odds validation, and risk management.
 * These values MUST match the edge function generate-market-odds/index.ts
 */

// ============================================================
// PROBABILITY FLOORS - Enforce minimum probabilities by rank
// Multipliers are derived from probabilities, NOT clipped afterward
// These are base values for 8-athlete fields - dynamically scaled for larger fields
// ============================================================
export const PROBABILITY_FLOORS = {
  WINNER: {
    rank1Min: 0.25,  // Rank #1 ≥ 25% → max 4.0x
    rank2Min: 0.18,  // Rank #2 ≥ 18% → max 5.5x
    rank3Min: 0.12,  // Rank #3 ≥ 12% → max 8.3x
  },
  PODIUM: {
    rank1Min: 0.55,  // Rank #1 ≥ 55% → max 1.8x
    rank2Min: 0.45,  // Rank #2 ≥ 45% → max 2.2x
    rank3Min: 0.35,  // Rank #3 ≥ 35% → max 2.8x
  },
  HIGHEST_SCORE: {
    rank1Min: 0.22,  // Rank #1 ≥ 22% → max 4.5x
    rank2Min: 0.15,  // Rank #2 ≥ 15% → max 6.6x
    rank3Min: 0.10,  // Rank #3 ≥ 10% → max 10x
  },
} as const;

// ============================================================
// DYNAMIC FLOOR SCALING CONSTANTS
// Used to adjust probability floors based on field size
// ============================================================
export const DYNAMIC_FLOOR_CONFIG = {
  /** Reference field size (floors are designed for this) */
  REFERENCE_FIELD_SIZE: 8,
  /** Minimum scale factor (never go below 35% of original floors) */
  MIN_SCALE_FACTOR: 0.35,
} as const;

/**
 * Get dynamically scaled probability floors based on field size
 * Larger fields need lower minimum probabilities to avoid implied sum > 1.0
 */
export const getDynamicFloors = (
  fieldSize: number,
  marketType: MarketType
): { rank1Min: number; rank2Min: number; rank3Min: number } => {
  const base = PROBABILITY_FLOORS[marketType] || PROBABILITY_FLOORS.WINNER;
  
  if (fieldSize <= DYNAMIC_FLOOR_CONFIG.REFERENCE_FIELD_SIZE) {
    return base;
  }
  
  const scaleFactor = Math.max(
    DYNAMIC_FLOOR_CONFIG.REFERENCE_FIELD_SIZE / fieldSize,
    DYNAMIC_FLOOR_CONFIG.MIN_SCALE_FACTOR
  );
  
  return {
    rank1Min: base.rank1Min * scaleFactor,
    rank2Min: base.rank2Min * scaleFactor,
    rank3Min: base.rank3Min * scaleFactor,
  };
};

// ============================================================
// MAIN RISK CONFIG OBJECT
// ============================================================
export const RISK_CONFIG = {
  /** Maximum stake per prediction in tokens */
  MAX_STAKE: 10000,
  
  /** Maximum payout per prediction in tokens */
  MAX_PAYOUT: 150000,
  
  /** Liability caps per market type (in tokens) */
  LIABILITY_CAPS: {
    WINNER: 500000,
    PODIUM: 300000,
    HIGHEST_SCORE: 400000,
  } as const,
  
  /** Maximum athlete exposure as % of market pool (Option A risk control) */
  MAX_ATHLETE_ALLOCATION_PCT: 0.30,
  
  MAX_ATHLETE_EXPOSURE_PCT: 0.30,
  
  /** Pre-publish safety margin (max payout must be ≤ 95% of possible pool) */
  PUBLISH_SAFETY_MARGIN: 0.95,
  
  /** Target implied sum bands by market type (house edge enforcement) */
  IMPLIED_SUM_BANDS: {
    WINNER: { target: 0.909, min: 0.90, max: 0.915 },
    PODIUM: { target: 0.847, min: 0.84, max: 0.86 },
    HIGHEST_SCORE: { target: 0.877, min: 0.87, max: 0.89 },
  } as const,
  
  /** Maximum risk ratio by market type (caps house downside at 10-15%) */
  MAX_RISK_RATIO: {
    WINNER: 1.15,
    PODIUM: 1.10,
    HIGHEST_SCORE: 1.12,
  } as const,
  
  /** Compression rules (disabled in Option A during OPEN markets) */
  COMPRESSION: {
    MAX_ADJUSTMENT_PCT: 0.08,
    MIN_EXPOSURE_PCT: 0.05,
    MULTIPLIER_FLOOR: 1.20,
  } as const,
  
  /** 
   * CALIBRATION: PRIOR-DOMINANT model with probability floors
   * 80% prior (rank + rating), 20% MC
   * Enforces probability floors BEFORE normalization
   * Validates constraints as assertions (fail fast)
   */
  CALIBRATION: {
    TEMPERATURE: {
      WINNER: 5,
      HIGHEST_SCORE: 6,
      PODIUM: 4,
    } as const,
    PRIOR_BLEND_ALPHA: 0.20,
    TEMP_REDUCTION_FACTOR: 0.90,
    MAX_ITERATIONS: 20,
  } as const,
  
  /**
   * TOP-3 MULTIPLIER CONSTRAINTS (ASSERTIONS - not adjustments)
   * If violated after probability floors, market is INVALID
   */
  TOP3_CONSTRAINTS: {
    WINNER: { top1Max: 4.0, top2Max: 6.0, top3Max: 8.0 },
    HIGHEST_SCORE: { top1Max: 4.5, top2Max: 6.5, top3Max: 9.0 },
    PODIUM: { top1Max: 2.2, top2Max: 2.8, top3Max: 3.5 },
  } as const,
  
  /**
   * HARD MULTIPLIER CAPS (safety backstop only)
   */
  MULTIPLIER_CAPS: {
    WINNER: 15.0,
    HIGHEST_SCORE: 12.0,
    PODIUM: 8.0,
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
