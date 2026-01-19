/**
 * Risk configuration for house risk controls
 */

export const RISK_CONFIG = {
  /** Maximum tokens per single entry */
  MAX_STAKE: 10000,
  
  /** Maximum payout per single entry */
  MAX_PAYOUT: 150000,
  
  /** Maximum % of user's tournament stake that can go to one athlete */
  MAX_ATHLETE_ALLOCATION_PCT: 0.25,
  
  /** Liability caps by market type (as % of market handle) */
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
  
  /** Compression rules */
  COMPRESSION: {
    /** Maximum single adjustment per update (8%) */
    MAX_ADJUSTMENT_PCT: 0.08,
    /** Minimum % of total tokens to be eligible for compression */
    MIN_EXPOSURE_PCT: 0.05,
    /** Multiplier floor (never compress below this) */
    MULTIPLIER_FLOOR: 1.20,
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
