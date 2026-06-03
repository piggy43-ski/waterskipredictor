import { ParlayLeg } from '@/types/parlay';
import { PARLAY_CONFIG } from './parlayConfig';

/**
 * Parlay pricing with house safety
 * - Raw product multiplied by 0.75 haircut
 * - Hard caps by leg count
 * - Combined multiplier floored at 1.0 (a winning parlay can never pay below stake)
 * - 5+ legs DISABLED  (legacy comment — see PARLAY_CAPS / MAX_PARLAY_LEGS)
 */

const PARLAY_HAIRCUT = 0.75;
const PARLAY_FLOOR = 1.0;

const PARLAY_CAPS: Record<number, number> = {
  1: 15,    // Single leg capped at 15x
  2: 20,    // 2-leg max 20x
  3: 35,    // 3-leg max 35x
  4: 50,    // 4-leg max 50x
  5: 60,    // 5-leg max 60x  (bankroll-conservative; was 75)
  6: 80,    // 6-leg max 80x  (was 100)
  7: 105,   // 7-leg max 105x (was 130)
  8: 130,   // 8-leg max 130x (was 160)
};

const MAX_PARLAY_LEGS = 8;

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
  
  let totalDecimalOdds = 1;
  
  for (const leg of legs) {
    // Winner odds
    if (leg.winner?.decimal_odds) {
      totalDecimalOdds *= leg.winner.decimal_odds;
    }
    
    // Podium odds (3 selections)
    if (leg.podium.first?.decimal_odds) {
      totalDecimalOdds *= leg.podium.first.decimal_odds;
    }
    if (leg.podium.second?.decimal_odds) {
      totalDecimalOdds *= leg.podium.second.decimal_odds;
    }
    if (leg.podium.third?.decimal_odds) {
      totalDecimalOdds *= leg.podium.third.decimal_odds;
    }
    
    // Highest score odds
    if (leg.highestScore?.decimal_odds) {
      totalDecimalOdds *= leg.highestScore.decimal_odds;
    }
  }
  
  return totalDecimalOdds;
}

/**
 * Calculate the progressive cap based on number of legs
 * 5+ legs are DISABLED
 */
export function calculateProgressiveCap(legCount: number): number {
  if (legCount > MAX_PARLAY_LEGS) {
    return 0; // DISABLED
  }
  
  if (legCount <= 0) {
    return 0;
  }
  
  return PARLAY_CAPS[legCount] || PARLAY_CAPS[MAX_PARLAY_LEGS];
}

/**
 * Calculate the final parlay multiplier with house safety
 * Raw product × 0.75 haircut, then capped
 */
export function calculateParlayMultiplier(legs: ParlayLeg[]): number {
  if (legs.length === 0) return 0;
  if (legs.length > MAX_PARLAY_LEGS) return 0; // DISABLED for 5+ legs
  
  const completedLegs = legs.filter(l => l.isComplete);
  if (completedLegs.length === 0) return 0;
  
  const rawMultiplier = calculateRawParlayMultiplier(completedLegs);
  
  // Apply 25% haircut for house safety
  const withHaircut = rawMultiplier * PARLAY_HAIRCUT;
  
  // Apply progressive cap
  const cap = calculateProgressiveCap(completedLegs.length);
  
  // FIX 3a: floor at 1.0 so a winning parlay never pays below stake.
  return Math.min(Math.max(withHaircut, PARLAY_FLOOR), cap);
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
  const progressiveCap = calculateProgressiveCap(legCount);
  // FIX 3a: floor at 1.0
  const finalMultiplier = Math.min(Math.max(withHaircut, PARLAY_FLOOR), progressiveCap);
  
  return {
    rawMultiplier: Math.round(rawMultiplier * 100) / 100,
    withHaircut: Math.round(withHaircut * 100) / 100,
    progressiveCap: Math.round(progressiveCap * 100) / 100,
    finalMultiplier: Math.round(finalMultiplier * 100) / 100,
    isCapped: withHaircut > progressiveCap,
    isDisabled: false,
    legCount
  };
}

/**
 * Get suggestions for increasing the multiplier
 */
export function getMultiplierSuggestions(legs: ParlayLeg[], availableDisciplines: string[]): string[] {
  const { legCount, isDisabled, isCapped, progressiveCap } = getParlayMultiplierDetails(legs);
  const suggestions: string[] = [];
  
  if (isDisabled) {
    suggestions.push(`Maximum ${MAX_PARLAY_LEGS} legs allowed. Remove a leg to continue.`);
    return suggestions;
  }
  
  // Calculate what cap would be with one more leg
  if (legCount < MAX_PARLAY_LEGS) {
    const nextCap = calculateProgressiveCap(legCount + 1);
    suggestions.push(`Add another leg to increase max cap from ${progressiveCap}x to ${nextCap}x`);
  }
  
  // If currently capped, show max legs info
  if (isCapped && legCount < MAX_PARLAY_LEGS) {
    const legsNeeded = MAX_PARLAY_LEGS - legCount;
    suggestions.push(`Add ${legsNeeded} more leg${legsNeeded > 1 ? 's' : ''} to unlock full ${PARLAY_CAPS[MAX_PARLAY_LEGS]}x potential`);
  }
  
  return suggestions;
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
