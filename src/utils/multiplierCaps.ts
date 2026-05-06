// Multiplier caps and validation for manual overrides - AGGRESSIVE to prevent bankruptcy

export const MULTIPLIER_CAPS = {
  WINNER: { min: 1.50, max: 8.0 },
  PODIUM: { min: 1.25, max: 6.0 },
  HIGHEST_SCORE: { min: 1.50, max: 7.0 },
  HEAD_TO_HEAD: { min: 1.5, max: 5.0 },
  OVER_UNDER: { min: 1.5, max: 5.0 },
} as const;

// Rank-specific caps - favorites are capped VERY tight
export const RANK_CAPS = {
  WINNER: {
    1: 1.50,   // Rank 1 (best athlete) max 1.5x
    2: 2.25,
    3: 3.00,
    4: 4.00,
    5: 5.00,
  } as Record<number, number>,
  PODIUM: {
    1: 1.25,
    2: 1.75,
    3: 2.25,
  } as Record<number, number>,
  HIGHEST_SCORE: {
    1: 1.80,
    2: 2.50,
    3: 3.50,
  } as Record<number, number>,
};

/**
 * Combined podium (exact-order) multiplier ceiling.
 * Raised to 25x (from 18x) to reflect the genuine difficulty of predicting
 * exact podium order — 6x harder than top-3-any-order combinatorially (3!).
 * Worst case at $10 entry = $250.
 * Used by `podiumMultipliers.calculatePodiumCombinedMultiplier`.
 */
export const MAX_PODIUM_COMBINED_MULTIPLIER = 25; // was 18 (= PODIUM.max × 3)

export const TARGET_IMPLIED_SUM = {
  WINNER: { min: 0.90, max: 0.92 },
  PODIUM: { min: 0.84, max: 0.86 },
  HIGHEST_SCORE: { min: 0.87, max: 0.89 },
  HEAD_TO_HEAD: { min: 0.95, max: 1.0 },
  OVER_UNDER: { min: 0.95, max: 1.0 },
} as const;

export type MarketTypeKey = keyof typeof MULTIPLIER_CAPS;

export interface MultiplierValidation {
  valid: boolean;
  error?: string;
  clamped?: number;
}

/**
 * Validate a multiplier against market-type and rank-specific caps
 */
export function validateMultiplier(
  marketType: MarketTypeKey,
  value: number,
  fieldRank?: number
): MultiplierValidation {
  const caps = MULTIPLIER_CAPS[marketType];
  if (!caps) {
    return { valid: false, error: `Unknown market type: ${marketType}` };
  }
  
  if (isNaN(value) || value <= 0) {
    return { valid: false, error: 'Multiplier must be a positive number' };
  }
  
  // Check rank-specific cap first (most restrictive)
  if (fieldRank && fieldRank >= 1 && fieldRank <= 5) {
    const rankCaps = RANK_CAPS[marketType as keyof typeof RANK_CAPS];
    if (rankCaps && rankCaps[fieldRank]) {
      const rankMaxCap = rankCaps[fieldRank];
      if (value > rankMaxCap) {
        return { 
          valid: false, 
          error: `Rank #${fieldRank} max is ${rankMaxCap}x for ${marketType}`,
          clamped: rankMaxCap 
        };
      }
    }
  }
  
  if (value < caps.min) {
    return { 
      valid: false, 
      error: `Below minimum ${caps.min}x for ${marketType}`,
      clamped: caps.min 
    };
  }
  
  if (value > caps.max) {
    return { 
      valid: false, 
      error: `Above maximum ${caps.max}x for ${marketType}`,
      clamped: caps.max 
    };
  }
  
  return { valid: true };
}

/**
 * Clamp a multiplier to market-type bounds
 */
export function clampMultiplier(
  marketType: MarketTypeKey,
  value: number
): number {
  const caps = MULTIPLIER_CAPS[marketType];
  if (!caps) return value;
  return Math.max(caps.min, Math.min(caps.max, value));
}

/**
 * Round multiplier to nearest 0.05 step
 */
export function roundToStep(value: number, step: number = 0.05): number {
  return Math.round(value / step) * step;
}

/**
 * Calculate implied probability sum from array of multipliers
 */
export function calculateImpliedSum(multipliers: number[]): number {
  if (multipliers.length === 0) return 0;
  return multipliers.reduce((sum, m) => sum + (1 / m), 0);
}

export type ImpliedSumStatus = 'OK' | 'WARNING' | 'BLOCKED';

export interface ImpliedSumResult {
  value: number;
  status: ImpliedSumStatus;
  target: { min: number; max: number };
  message: string;
}

/**
 * Get implied sum status with detailed info
 */
export function getImpliedSumStatus(
  impliedSum: number,
  marketType: MarketTypeKey
): ImpliedSumResult {
  const band = TARGET_IMPLIED_SUM[marketType];
  if (!band) {
    return {
      value: impliedSum,
      status: 'WARNING',
      target: { min: 0.9, max: 1.0 },
      message: 'Unknown market type'
    };
  }
  
  const percentage = (impliedSum * 100).toFixed(1);
  const targetRange = `${(band.min * 100).toFixed(1)}%–${(band.max * 100).toFixed(1)}%`;
  
  if (impliedSum >= band.min && impliedSum <= band.max) {
    return {
      value: impliedSum,
      status: 'OK',
      target: band,
      message: `${percentage}% is within target range (${targetRange})`
    };
  }
  
  // Allow 10% tolerance for WARNING vs BLOCKED
  const tolerance = 0.10;
  const lowerBound = band.min * (1 - tolerance);
  const upperBound = band.max * (1 + tolerance);
  
  if (impliedSum >= lowerBound && impliedSum <= upperBound) {
    return {
      value: impliedSum,
      status: 'WARNING',
      target: band,
      message: `${percentage}% is outside target (${targetRange}) but within tolerance`
    };
  }
  
  return {
    value: impliedSum,
    status: 'BLOCKED',
    target: band,
    message: `${percentage}% is dangerously outside target range (${targetRange})`
  };
}

/**
 * Check monotonic constraint: better rank should have lower or equal multiplier
 */
export function validateMonotonic(
  athletes: Array<{ rank: number; multiplier: number }>
): { valid: boolean; violations: string[] } {
  const sorted = [...athletes].sort((a, b) => a.rank - b.rank);
  const violations: string[] = [];
  
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    
    if (curr.multiplier < prev.multiplier) {
      violations.push(
        `Rank #${curr.rank} (${curr.multiplier}x) < Rank #${prev.rank} (${prev.multiplier}x)`
      );
    }
  }
  
  return {
    valid: violations.length === 0,
    violations
  };
}

/**
 * Get display color class for implied sum status
 */
export function getImpliedSumColorClass(status: ImpliedSumStatus): string {
  switch (status) {
    case 'OK':
      return 'text-green-600 bg-green-50';
    case 'WARNING':
      return 'text-yellow-600 bg-yellow-50';
    case 'BLOCKED':
      return 'text-red-600 bg-red-50';
    default:
      return 'text-muted-foreground bg-muted';
  }
}
