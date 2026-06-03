import { ParlayLeg } from '@/types/parlay';
import { PARLAY_CONFIG } from './parlayConfig';

/**
 * Parlay pricing (operator-tuned, 2026-06):
 * - Within a single leg, sub-picks (Winner, Podium 1-2-3, Highest Score)
 *   are SUMMED, not multiplied. This kills the correlation overpay that
 *   product-within-leg produces (e.g. Ross as Winner + Ross #1 on Podium).
 * - Leg factors are then multiplied across legs (cross-leg stacking).
 * - Raw product × 0.75 haircut.
 * - Floored at 1.0 (a winning parlay can never pay below stake)
 * - No leg-count cap and no progressive multiplier cap
 *   (operator dropped these explicitly; 1000-token podium stake cap and
 *    chalk-concentration trigger still apply)
 */

const PARLAY_HAIRCUT = 0.75;
const PARLAY_FLOOR = 1.0;

// Effectively unbounded leg count — keep a sanity ceiling so UI never spins.
const MAX_PARLAY_LEGS = 64;

/**
 * Convert American odds to decimal odds
 */
export function americanToDecimal(americanOdds: number): number {
  if (americanOdds > 0) {
    return 1 + (americanOdds / 100);
  } else {
    return 1 + (100 / Math.abs(americanOdds));
  }
}

/**
 * Calculate the raw parlay multiplier from all selections' decimal odds
 * Each leg contains: winner + 3 podium positions + highest score = 5 selections
 */
export function calculateRawParlayMultiplier(legs: ParlayLeg[]): number {
  if (legs.length === 0) return 0;

  let product = 1;

  for (const leg of legs) {
    let legFactor = 0;

    if (leg.winner?.decimal_odds && leg.winner.decimal_odds > 0) {
      legFactor += leg.winner.decimal_odds;
    }

    if (
      leg.podium.first &&
      leg.podium.second &&
      leg.podium.third &&
      typeof leg.podiumMultiplier === 'number' &&
      leg.podiumMultiplier > 0
    ) {
      legFactor += leg.podiumMultiplier;
    }

    if (leg.highestScore?.decimal_odds && leg.highestScore.decimal_odds > 0) {
      legFactor += leg.highestScore.decimal_odds;
    }

    // Leg with no sub-picks contributes nothing (neutral 1x).
    if (legFactor <= 0) legFactor = 1;

    product *= legFactor;
  }

  return product;
}

/**
 * Progressive cap is intentionally disabled. Returns Infinity so the
 * `Math.min(..., cap)` call in calculateParlayMultiplier is a no-op.
 * Kept as a named export so downstream callers don't break.
 */
export function calculateProgressiveCap(legCount: number): number {
  if (legCount <= 0) return 0;
  return Number.POSITIVE_INFINITY;
}

/**
 * Calculate the final parlay multiplier with house safety
 * Raw product × 0.75 haircut, then capped
 */
export function calculateParlayMultiplier(legs: ParlayLeg[]): number {
  if (legs.length === 0) return 0;
  if (legs.length > MAX_PARLAY_LEGS) return 0;
  
  const completedLegs = legs.filter(l => l.isComplete);
  if (completedLegs.length === 0) return 0;
  
  const rawMultiplier = calculateRawParlayMultiplier(completedLegs);
  
  // Apply 25% haircut for house safety
  const withHaircut = rawMultiplier * PARLAY_HAIRCUT;
  
  // No progressive cap — only the floor applies.
  return Math.max(withHaircut, PARLAY_FLOOR);
}

/**
 * Get detailed multiplier info for UI display
 */
export function getParlayMultiplierDetails(legs: ParlayLeg[]): {
  rawMultiplier: number;
  withHaircut: number;
  progressiveCap: number;
  finalMultiplier: number;
  isCapped: boolean;
  isDisabled: boolean;
  legCount: number;
} {
  const completedLegs = legs.filter(l => l.isComplete);
  const legCount = completedLegs.length;
  
  if (legCount > MAX_PARLAY_LEGS) {
    return {
      rawMultiplier: 0,
      withHaircut: 0,
      progressiveCap: 0,
      finalMultiplier: 0,
      isCapped: false,
      isDisabled: true,
      legCount
    };
  }
  
  const rawMultiplier = calculateRawParlayMultiplier(completedLegs);
  const withHaircut = rawMultiplier * PARLAY_HAIRCUT;
  const finalMultiplier = Math.max(withHaircut, PARLAY_FLOOR);
  
  return {
    rawMultiplier: Math.round(rawMultiplier * 100) / 100,
    withHaircut: Math.round(withHaircut * 100) / 100,
    progressiveCap: 0,
    finalMultiplier: Math.round(finalMultiplier * 100) / 100,
    isCapped: false,
    isDisabled: false,
    legCount
  };
}

/**
 * Get suggestions for increasing the multiplier
 */
export function getMultiplierSuggestions(legs: ParlayLeg[], availableDisciplines: string[]): string[] {
  // Caps removed; no suggestions to surface.
  return [];
}

/**
 * Check if a discipline+gender combination already exists in legs
 */
export function isDuplicateLeg(legs: ParlayLeg[], discipline: string, gender: string): boolean {
  return legs.some(leg => leg.discipline === discipline && leg.gender === gender);
}

/**
 * FIX 1: Same-athlete correlation block.
 * Within a SINGLE discipline+gender slot (one ParlayLeg), an athlete may appear in
 * AT MOST ONE sub-selection (winner OR a podium slot OR highest-score).
 * Returns the offending athlete_id (or null if none).
 * Cross-leg / cross-discipline reuse is allowed and intentionally not checked here.
 */
export function findDuplicateAthleteIdInLeg(leg: ParlayLeg): string | null {
  const ids: string[] = [];
  const pushIf = (sel: any) => {
    const aid = sel?.athlete?.id;
    if (typeof aid === 'string' && aid.length > 0) ids.push(aid);
  };
  pushIf(leg.winner);
  pushIf(leg.podium?.first);
  pushIf(leg.podium?.second);
  pushIf(leg.podium?.third);
  pushIf(leg.highestScore);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return null;
}

/**
 * Convenience: returns the first slot that violates Fix 1 across an entire parlay, or null.
 */
export function findDuplicateAthleteSlot(
  legs: ParlayLeg[]
): { legIndex: number; athleteId: string } | null {
  for (let i = 0; i < legs.length; i++) {
    const dup = findDuplicateAthleteIdInLeg(legs[i]);
    if (dup) return { legIndex: i, athleteId: dup };
  }
  return null;
}

/**
 * Check if more legs can be added
 */
export function canAddMoreLegs(legs: ParlayLeg[]): boolean {
  return legs.length < MAX_PARLAY_LEGS;
}

/**
 * Get maximum allowed legs
 */
export function getMaxParlayLegs(): number {
  return MAX_PARLAY_LEGS;
}
