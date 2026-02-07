/**
 * MULTIPLIER UTILITIES - Derived from probabilities, user-facing display
 * 
 * Multipliers are ALWAYS derived from probabilities:
 *   base_multiplier = 1 / probability
 *   final_multiplier = base_multiplier * house_edge_factor (where factor < 1)
 * 
 * NO "odds" terminology anywhere in this file.
 */

// ============================================================
// CONFIGURATION
// ============================================================
export const MULTIPLIER_CONFIG = {
  // Target implied sum bands (Σ(1/multiplier) should fall within these)
  // Lower values = more house edge
  TARGET_IMPLIED_SUM: {
    WINNER: { min: 0.90, max: 0.92 },
    PODIUM: { min: 0.84, max: 0.86 },
    HIGHEST_SCORE: { min: 0.87, max: 0.89 },
  },
  
  // Multiplier caps per market type - UPDATED for proper calibration
  // HIGHEST_SCORE max reduced to 8x to prevent longshot clumping
  MULTIPLIER_CAPS: {
    WINNER: { min: 1.8, max: 12.0 },
    PODIUM: { min: 1.4, max: 10.0 },
    HIGHEST_SCORE: { min: 2.0, max: 8.0 },
  },
  
  // Rank-specific caps for WINNER market
  WINNER_RANK_CAPS: {
    1: 4.0,   // Rank 1 max 4.0x
    2: 6.0,   // Rank 2 max 6.0x
    3: 8.0,   // Rank 3 max 8.0x
  } as Record<number, number>,
  
  // Rounding step
  ROUNDING_STEP: 0.1,
  
  // Softmax temperature per market type (lower = sharper favorites)
  TEMPERATURE: {
    WINNER: 0.85,
    PODIUM: 1.05,
    HIGHEST_SCORE: 1.00,
  },
};

// Multiplier ladder for snapping to standard values
export const MULTIPLIER_LADDER = [
  1.10, 1.15, 1.20, 1.25, 1.30, 1.35, 1.40, 1.45, 1.50, 1.55, 1.60, 1.65, 1.70, 1.75, 1.80, 1.85, 1.90, 1.95,
  2.00, 2.10, 2.20, 2.30, 2.40, 2.50, 2.60, 2.70, 2.80, 2.90,
  3.00, 3.20, 3.40, 3.60, 3.80,
  4.00, 4.20, 4.40, 4.60, 4.80,
  5.00, 5.25, 5.50, 5.75,
  6.00, 6.25, 6.50, 6.75,
  7.00, 7.50, 8.00, 8.50, 9.00, 9.50,
  10.00, 10.50, 11.00, 11.50, 12.00, 12.50, 13.00, 13.50, 14.00, 14.50, 15.00,
  16.00, 17.00, 18.00, 19.00, 20.00
];

// ============================================================
// TYPES
// ============================================================
export type MarketType = 'WINNER' | 'PODIUM' | 'HIGHEST_SCORE';

export interface MultiplierResult {
  multipliers: number[];
  impliedSum: number;
  edgeFactor: number;
  status: 'OK' | 'WARNING' | 'BLOCKED';
}

export interface AthleteMultiplier {
  id: string;
  probability: number;
  baseMultiplier: number;
  finalMultiplier: number;
  fieldRank: number;
}

// ============================================================
// CORE UTILITIES
// ============================================================
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function roundToLadder(v: number): number {
  if (v <= MULTIPLIER_LADDER[0]) return MULTIPLIER_LADDER[0];
  if (v >= MULTIPLIER_LADDER[MULTIPLIER_LADDER.length - 1]) return MULTIPLIER_LADDER[MULTIPLIER_LADDER.length - 1];
  let closest = MULTIPLIER_LADDER[0];
  for (const l of MULTIPLIER_LADDER) {
    if (Math.abs(l - v) < Math.abs(closest - v)) closest = l;
  }
  return closest;
}

export function roundToStep(value: number, step: number = 0.1): number {
  return Math.round(value / step) * step;
}

// ============================================================
// MULTIPLIER DERIVATION
// ============================================================

/**
 * Calculate implied sum from array of multipliers
 * This is the sum of (1/multiplier) for all athletes
 */
export function calculateImpliedSum(multipliers: number[]): number {
  if (multipliers.length === 0) return 0;
  return multipliers.reduce((sum, m) => sum + (1 / m), 0);
}

/**
 * Get implied sum status relative to target band
 */
export function getImpliedSumStatus(
  impliedSum: number,
  marketType: MarketType
): { status: 'OK' | 'WARNING' | 'BLOCKED'; target: { min: number; max: number }; message: string } {
  const band = MULTIPLIER_CONFIG.TARGET_IMPLIED_SUM[marketType];
  const percentage = (impliedSum * 100).toFixed(1);
  const targetRange = `${(band.min * 100).toFixed(1)}%–${(band.max * 100).toFixed(1)}%`;
  
  if (impliedSum >= band.min && impliedSum <= band.max) {
    return {
      status: 'OK',
      target: band,
      message: `${percentage}% within target (${targetRange})`
    };
  }
  
  // 10% tolerance for WARNING vs BLOCKED
  const tolerance = 0.10;
  const lowerBound = band.min * (1 - tolerance);
  const upperBound = band.max * (1 + tolerance);
  
  if (impliedSum >= lowerBound && impliedSum <= upperBound) {
    return {
      status: 'WARNING',
      target: band,
      message: `${percentage}% outside target (${targetRange}) but within tolerance`
    };
  }
  
  return {
    status: 'BLOCKED',
    target: band,
    message: `${percentage}% dangerously outside target (${targetRange})`
  };
}

/**
 * Derive multipliers from probabilities with house edge enforcement
 */
export function deriveMultipliers(
  probabilities: number[],
  marketType: MarketType,
  fieldSize: number,
  fieldRanks?: Map<string, number>,
  athleteIds?: string[]
): MultiplierResult {
  const target = MULTIPLIER_CONFIG.TARGET_IMPLIED_SUM[marketType];
  const caps = MULTIPLIER_CONFIG.MULTIPLIER_CAPS[marketType];
  const targetMid = (target.min + target.max) / 2;
  
  // Dynamic cap scaling for large fields to prevent clumping at max
  const fieldSizeAdjustment = Math.max(1, fieldSize / 20);
  const dynamicMax = Math.min(caps.max * fieldSizeAdjustment, 25.0);
  
  // Calculate edge factor to hit target implied sum
  const edgeFactor = targetMid;
  
  // Apply edge and derive multipliers
  const multipliers = probabilities.map((p, idx) => {
    const p_adj = p * edgeFactor;
    if (p_adj <= 0) return dynamicMax;
    
    let m = 1 / p_adj;
    
    // Apply rank-specific caps for WINNER
    if (marketType === 'WINNER' && fieldRanks && athleteIds) {
      const fieldRank = fieldRanks.get(athleteIds[idx]);
      if (fieldRank && MULTIPLIER_CONFIG.WINNER_RANK_CAPS[fieldRank]) {
        m = Math.min(m, MULTIPLIER_CONFIG.WINNER_RANK_CAPS[fieldRank]);
      }
    }
    
    m = clamp(m, caps.min, dynamicMax);
    return roundToLadder(m);
  });
  
  const impliedSum = calculateImpliedSum(multipliers);
  const { status } = getImpliedSumStatus(impliedSum, marketType);
  
  return { multipliers, impliedSum, edgeFactor, status };
}

// ============================================================
// PARLAY / COMBO CALCULATIONS
// ============================================================

/**
 * Calculate combined multiplier for a parlay (combo prediction)
 * @param multipliers Array of individual leg multipliers
 * @param platformFee Platform fee percentage (default 5% = 0.05)
 * @returns Combined multiplier after fee
 */
export function calculateCombinedMultiplier(
  multipliers: number[], 
  platformFee: number = 0.05
): number {
  if (multipliers.length === 0) return 1;
  
  // Multiply all multipliers together
  const raw = multipliers.reduce((acc, m) => acc * m, 1);
  
  // Apply platform fee (fee < 1)
  return raw * (1 - platformFee);
}

/**
 * Calculate projected rewards for an entry
 * @param entryAmount Amount of tokens entered
 * @param multiplier The multiplier (can be single or combined)
 * @returns Projected rewards (rounded down)
 */
export function calculateProjectedRewards(
  entryAmount: number, 
  multiplier: number
): number {
  return Math.floor(entryAmount * multiplier);
}

/**
 * Convert probability to multiplier with house edge
 * @param probability Win probability (0-1)
 * @param houseEdge House edge factor (default 10% = 0.10)
 * @returns Final multiplier
 */
export function probabilityToMultiplier(
  probability: number,
  houseEdge: number = 0.10
): number {
  if (probability <= 0 || probability > 1) return 99.99;
  const baseMultiplier = 1 / probability;
  return baseMultiplier * (1 - houseEdge);
}

// ============================================================
// DISPLAY FORMATTING
// ============================================================

/**
 * Format multiplier for display (e.g., "2.50x")
 */
export function formatMultiplier(value: number): string {
  if (!value || isNaN(value)) return '—';
  return `${value.toFixed(2)}x`;
}

/**
 * Format probability as percentage (e.g., "25.5%")
 * Note: This is ADMIN ONLY - never shown to users
 */
export function formatProbabilityPercent(p: number): string {
  if (!p || isNaN(p)) return '—';
  return `${(p * 100).toFixed(1)}%`;
}

/**
 * Get color class based on implied sum status
 */
export function getImpliedSumColorClass(status: 'OK' | 'WARNING' | 'BLOCKED'): string {
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

// ============================================================
// VALIDATION
// ============================================================

/**
 * Validate multiplier against market-type caps
 */
export function validateMultiplier(
  marketType: MarketType,
  value: number,
  fieldRank?: number
): { valid: boolean; error?: string; clamped?: number } {
  const caps = MULTIPLIER_CONFIG.MULTIPLIER_CAPS[marketType];
  
  if (isNaN(value) || value <= 0) {
    return { valid: false, error: 'Multiplier must be a positive number' };
  }
  
  // Check rank-specific cap for WINNER
  if (marketType === 'WINNER' && fieldRank && MULTIPLIER_CONFIG.WINNER_RANK_CAPS[fieldRank]) {
    const rankCap = MULTIPLIER_CONFIG.WINNER_RANK_CAPS[fieldRank];
    if (value > rankCap) {
      return { 
        valid: false, 
        error: `Rank #${fieldRank} max is ${rankCap}x`,
        clamped: rankCap 
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
 * Check monotonic constraint: better rank should have lower or equal multiplier
 */
export function validateMonotonic(
  athletes: Array<{ fieldRank: number; multiplier: number }>
): { valid: boolean; violations: string[] } {
  const sorted = [...athletes].sort((a, b) => a.fieldRank - b.fieldRank);
  const violations: string[] = [];
  
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    
    // Higher rank (worse) should have >= multiplier
    if (curr.multiplier < prev.multiplier) {
      violations.push(
        `Rank #${curr.fieldRank} (${curr.multiplier}x) < Rank #${prev.fieldRank} (${prev.multiplier}x)`
      );
    }
  }
  
  return {
    valid: violations.length === 0,
    violations
  };
}
