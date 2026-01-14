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
} as const;

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
export const getLiabilityCap = (marketType: 'WINNER' | 'PODIUM' | 'HIGHEST_SCORE'): number => {
  return RISK_CONFIG.LIABILITY_CAPS[marketType] || RISK_CONFIG.LIABILITY_CAPS.WINNER;
};