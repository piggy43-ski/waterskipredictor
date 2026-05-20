// Multiplier caps and validation for manual overrides - AGGRESSIVE to prevent bankruptcy

export const MULTIPLIER_CAPS = {
  // Rank-tiered structure (locked 2026-05-19): tail ranks (8+) need head-room
  // so that the implied-sum band is reachable in large fields without the
  // global cap acting as a floor. Favorite caps (ranks 1–3) stay tight via
  // RANK_CAPS — the global max is only ever hit by deep longshots.
  WINNER:        { min: 1.10, max: 25.0 },
  PODIUM:        { min: 1.10, max: 12.0 },
  HIGHEST_SCORE: { min: 1.10, max: 22.0 },
  HEAD_TO_HEAD:  { min: 1.10, max: 5.0 },
  OVER_UNDER:    { min: 1.10, max: 5.0 },
} as const;

// Rank-tiered caps. Top-3 still capped tight individually; ranks 4–7 share
// a mid-tier cap; ranks 8+ share a wide tail cap so big fields can satisfy
// the implied-sum target without forcing a constant-multiplier tail.
// Use `getRankCap(market, rank)` to resolve — do NOT read this object directly.
export const RANK_CAPS: Record<string, Record<string | number, number>> = {
  WINNER:        { 1: 1.50, 2: 2.25, 3: 3.00, '4-7': 5.00, '8+': 20.00 },
  PODIUM:        { 1: 1.25, 2: 1.75, 3: 2.20, '4-7': 4.00, '8+': 10.00 },
  HIGHEST_SCORE: { 1: 1.80, 2: 2.50, 3: 3.40, '4-7': 5.50, '8+': 18.00 },
  HEAD_TO_HEAD:  {},
};

/**
 * Resolve the effective rank cap for a given market + rank. Resolution order:
 *   1. exact rank key (e.g. RANK_CAPS.WINNER[1])
 *   2. tier key '4-7' if rank ∈ [4,7]
 *   3. tier key '8+'  if rank ≥ 8
 *   4. fall through to MULTIPLIER_CAPS[market].max
 */
export function getRankCap(marketType: MarketTypeKey, rank: number): number {
  const caps = RANK_CAPS[marketType] || {};
  const globalMax = MULTIPLIER_CAPS[marketType]?.max ?? Infinity;
  if (rank in caps) return caps[rank] as number;
  if (rank >= 4 && rank <= 7 && caps['4-7'] != null) return caps['4-7'] as number;
  if (rank >= 8 && caps['8+'] != null) return caps['8+'] as number;
  return globalMax;
}

/**
 * Combined podium (exact-order) multiplier ceiling.
 * Raised to 25x (from 18x) to reflect the genuine difficulty of predicting
 * exact podium order — 6x harder than top-3-any-order combinatorially (3!).
 * Worst case at $10 entry = $250.
 * Used by `podiumMultipliers.calculatePodiumCombinedMultiplier`.
 */
export const MAX_PODIUM_COMBINED_MULTIPLIER = 25; // was 18 (= PODIUM.max × 3)

export const TARGET_IMPLIED_SUM = {
  // Recalibrated 2026-05-20: tight favorite rank caps (1.5/2.25/3.0) make the
  // old 0.90–0.92 band mathematically unreachable. Top-3 alone implies ≈1.44.
  // New band reflects "favorites priced fair, longshots priced as moonshots".
  WINNER: { min: 1.40, max: 1.50 },
  // PODIUM is a TOP-3 market: 3 winners per event → target ≈ 3 × (1 + house margin).
  // 3 × 1.05 ≈ 3.15. Previous 0.84–0.86 band was mathematically wrong — it treated
  // PODIUM as a single-winner market and caused the calibrator to silently emit
  // multipliers above caps (Swiss Pro Slalom women's at 5.04 implied sum bug).
  PODIUM: { min: 3.10, max: 3.20 },
  // Recalibrated 2026-05-20: same reason as WINNER. Top-3 caps (1.8/2.5/3.4)
  // imply ≈1.25 floor — band moved to 1.22–1.32.
  HIGHEST_SCORE: { min: 1.22, max: 1.32 },
  // HEAD_TO_HEAD: 2 sides per event → target ≈ 2 × (1 + house margin). 2 × 0.965 ≈ 1.93.
  HEAD_TO_HEAD: { min: 1.90, max: 1.96 },
  OVER_UNDER: { min: 1.90, max: 1.96 },
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
  
  // Check rank-tiered cap first (most restrictive). Resolves via tier bands.
  if (fieldRank && fieldRank >= 1) {
    const rankMaxCap = getRankCap(marketType, fieldRank);
    if (rankMaxCap < caps.max && value > rankMaxCap) {
      return {
        valid: false,
        error: `Rank #${fieldRank} max is ${rankMaxCap}x for ${marketType}`,
        clamped: rankMaxCap,
      };
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
