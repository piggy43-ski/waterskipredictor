import { ParlayLeg } from '@/types/parlay';
import { PARLAY_CONFIG } from './parlayConfig';

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
 * More legs = higher allowed multiplier cap
 * 
 * Examples:
 * - 1 leg: ~17.6x cap
 * - 3 legs: ~50.8x cap  
 * - 6 legs: ~100.5x cap
 * - 12 legs: 200x cap
 */
export function calculateProgressiveCap(legCount: number): number {
  const { MAX_PARLAY_MULTIPLIER, MAX_LEGS_FOR_FULL_CAP } = PARLAY_CONFIG;
  
  // If at or above max legs, return full cap
  if (legCount >= MAX_LEGS_FOR_FULL_CAP) {
    return MAX_PARLAY_MULTIPLIER;
  }
  
  // Progressive formula: cap scales linearly with leg count
  return 1 + (legCount / MAX_LEGS_FOR_FULL_CAP) * (MAX_PARLAY_MULTIPLIER - 1);
}

/**
 * Calculate the final parlay multiplier (raw odds capped by progressive limit)
 */
export function calculateParlayMultiplier(legs: ParlayLeg[]): number {
  if (legs.length === 0) return 0;
  
  const completedLegs = legs.filter(l => l.isComplete);
  if (completedLegs.length === 0) return 0;
  
  const rawMultiplier = calculateRawParlayMultiplier(completedLegs);
  const progressiveCap = calculateProgressiveCap(completedLegs.length);
  
  return Math.min(rawMultiplier, progressiveCap);
}

/**
 * Get detailed multiplier info for UI display
 */
export function getParlayMultiplierDetails(legs: ParlayLeg[]): {
  rawMultiplier: number;
  progressiveCap: number;
  finalMultiplier: number;
  isCapped: boolean;
  legCount: number;
} {
  const completedLegs = legs.filter(l => l.isComplete);
  const rawMultiplier = calculateRawParlayMultiplier(completedLegs);
  const progressiveCap = calculateProgressiveCap(completedLegs.length);
  const finalMultiplier = Math.min(rawMultiplier, progressiveCap);
  
  return {
    rawMultiplier: Math.round(rawMultiplier * 100) / 100,
    progressiveCap: Math.round(progressiveCap * 100) / 100,
    finalMultiplier: Math.round(finalMultiplier * 100) / 100,
    isCapped: rawMultiplier > progressiveCap,
    legCount: completedLegs.length
  };
}

/**
 * Get suggestions for increasing the multiplier
 */
export function getMultiplierSuggestions(legs: ParlayLeg[], availableDisciplines: string[]): string[] {
  const completedLegs = legs.filter(l => l.isComplete);
  const { progressiveCap, isCapped, legCount } = getParlayMultiplierDetails(legs);
  const suggestions: string[] = [];
  
  // Calculate what cap would be with one more leg
  if (legCount < PARLAY_CONFIG.MAX_LEGS_FOR_FULL_CAP) {
    const nextCap = calculateProgressiveCap(legCount + 1);
    suggestions.push(`Add another leg to increase max cap from ${progressiveCap.toFixed(0)}x to ${nextCap.toFixed(0)}x`);
  }
  
  // If currently capped, show how many more legs needed for full 200x
  if (isCapped && legCount < PARLAY_CONFIG.MAX_LEGS_FOR_FULL_CAP) {
    const legsNeeded = PARLAY_CONFIG.MAX_LEGS_FOR_FULL_CAP - legCount;
    suggestions.push(`Add ${legsNeeded} more leg${legsNeeded > 1 ? 's' : ''} to unlock full 200x potential`);
  }
  
  return suggestions;
}

/**
 * Check if a discipline+gender combination already exists in legs
 */
export function isDuplicateLeg(legs: ParlayLeg[], discipline: string, gender: string): boolean {
  return legs.some(leg => leg.discipline === discipline && leg.gender === gender);
}
