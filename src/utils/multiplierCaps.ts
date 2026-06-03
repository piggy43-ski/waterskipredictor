// Multiplier caps and validation for manual overrides - AGGRESSIVE to prevent bankruptcy

export const MULTIPLIER_CAPS = {
  // Rank-tiered structure (locked 2026-05-19): tail ranks (8+) need head-room
  // so that the implied-sum band is reachable in large fields without the
  // global cap acting as a floor. Favorite caps (ranks 1–3) stay tight via
  // RANK_CAPS — the global max is only ever hit by deep longshots.
  WINNER:        { min: 1.10, max: 25.0 },
  PODIUM:        { min: 1.25, max: 12.0 },
  HIGHEST_SCORE: { min: 1.10, max: 22.0 },
  HEAD_TO_HEAD:  { min: 1.10, max: 5.0 },
  OVER_UNDER:    { min: 1.10, max: 5.0 },
} as const;

// Rank-tiered caps. Top-3 still capped tight individually; ranks 4–7 share
// a mid-tier cap; ranks 8+ share a wide tail cap so big fields can satisfy
// the implied-sum target without forcing a constant-multiplier tail.
// Use `getRankCap(market, rank)` to resolve — do NOT read this object directly.
export const RANK_CAPS: Record<string, Record<string | number, number>> = {
  WINNER:        { 1: 1.50, 2: 2.25, 3: 3.00, 4: 4.00, 5: 4.75, 6: 5.50, 7: 6.50, '8+': 20.00 },
  PODIUM:        { 1: 1.25, 2: 1.75, 3: 2.20, 4: 3.25, 5: 3.75, 6: 4.25, 7: 5.00, '8+': 10.00 },
  HIGHEST_SCORE: { 1: 1.80, 2: 2.50, 3: 3.40, 4: 4.50, 5: 5.25, 6: 6.00, 7: 7.00, '8+': 18.00 },
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

/**
 * Cap for podium EXACT-ORDER (1-2-3) multipliers resolved through the
 * `market_podium_ordering_overrides` table or the formula fallback.
 * Sized to give admins headroom to price specific orderings without
 * piggy-backing on the order-blind sum method (which is correlation-unsafe).
 */
export const MAX_PODIUM_EXACT_ORDER_MULTIPLIER = 150;

// IMPLIED_SUM_FLOOR (locked 2026-05-20): one-sided anti-arbitrage floor.
// The book is "fair or better" for the house when Σ(1/m) ≥ floor.
// No upper bound — whatever the rank caps + probabilities produce above
// the floor is valid. The old narrow "band" was abandoned because it was
// mathematically incompatible with tight favorite caps at large field
// sizes, and was the source of the original cap-bypass bug.
//   WINNER:        1 winner  → 1.05   (≥ 5% margin on a 1-winner market)
//   PODIUM:        3 winners → 3.10   (3 × ~1.033 margin)
//   HIGHEST_SCORE: 1 winner  → 1.05
//   HEAD_TO_HEAD:  2 sides   → 2.00   (fair two-sided book)
export const IMPLIED_SUM_FLOOR: Record<MarketTypeKey, number> = {
  WINNER:        1.05,
  PODIUM:        3.10,
  HIGHEST_SCORE: 1.05,
  HEAD_TO_HEAD:  2.00,
  OVER_UNDER:    2.00,
};

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
  const floor = IMPLIED_SUM_FLOOR[marketType];
  const target = { min: floor ?? 1.0, max: Number.POSITIVE_INFINITY };
  if (floor == null) {
    return {
      value: impliedSum,
      status: 'WARNING',
      target,
      message: 'Unknown market type',
    };
  }

  if (impliedSum >= floor) {
    return {
      value: impliedSum,
      status: 'OK',
      target,
      message: `${impliedSum.toFixed(3)} ≥ floor ${floor.toFixed(2)}`,
    };
  }

  // Below floor = arbitrage. 5% tolerance for WARNING vs BLOCKED.
  if (impliedSum >= floor * 0.95) {
    return {
      value: impliedSum,
      status: 'WARNING',
      target,
      message: `${impliedSum.toFixed(3)} below floor ${floor.toFixed(2)} (within 5% tolerance)`,
    };
  }

  return {
    value: impliedSum,
    status: 'BLOCKED',
    target,
    message: `${impliedSum.toFixed(3)} is below anti-arbitrage floor ${floor.toFixed(2)}`,
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
