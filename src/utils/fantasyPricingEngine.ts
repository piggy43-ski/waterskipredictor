/**
 * Fantasy Pricing Engine for Waterski Fantasy
 * 
 * Dynamic pricing based on:
 * - Athlete tier
 * - Season performance
 * - Post-event adjustments
 */

import { TierLevel } from './athleteTiers';

// Base price bands by tier
export const FANTASY_PRICE_BANDS: Record<TierLevel, { base: number; maxMultiplier: number }> = {
  tier1: { base: 12000, maxMultiplier: 1.5 },
  tier2: { base: 8000, maxMultiplier: 1.3 },
  tier3: { base: 5000, maxMultiplier: 1.2 },
  unranked: { base: 3000, maxMultiplier: 1.1 },
};

// Price change constraints
export const PRICE_CHANGE_CAPS = {
  maxIncrease: 0.10, // +10% max per event
  maxDecrease: 0.10, // -10% max per event
  minPrice: 2000,
  maxPrice: 20000,
};

// Event-based adjustment percentages
export const EVENT_ADJUSTMENTS = {
  win: 0.05,        // +5% for 1st place
  second: 0.03,     // +3% for 2nd place
  third: 0.02,      // +2% for 3rd place
  top8: 0.01,       // +1% for 4th-8th
  missedCut: -0.02, // -2% for very poor placement
  noShow: -0.01,    // -1% for missed event
};

/**
 * Calculate initial fantasy price from tier + performance
 * 
 * @param tier - Athlete's strength tier
 * @param seasonPodiumRate - Season podium rate (0-1)
 * @returns Fantasy price in tokens
 */
export const calculateFantasyPrice = (
  tier: TierLevel,
  seasonPodiumRate: number
): number => {
  const band = FANTASY_PRICE_BANDS[tier];
  
  // Multiplier increases with performance
  // At 0% podium rate: multiplier = 1.0
  // At 100% podium rate: multiplier = maxMultiplier
  const multiplier = 1 + (seasonPodiumRate * (band.maxMultiplier - 1));
  
  const price = Math.round(band.base * multiplier);
  
  // Clamp to min/max
  return Math.max(
    PRICE_CHANGE_CAPS.minPrice,
    Math.min(PRICE_CHANGE_CAPS.maxPrice, price)
  );
};

/**
 * Calculate price from rank (for initial seeding from IWWF rankings)
 * Lower rank = higher price
 */
export const calculatePriceFromRank = (rank: number | null): number => {
  if (!rank || rank <= 0) {
    return FANTASY_PRICE_BANDS.unranked.base;
  }
  
  // Tier 1: Rank 1-5
  if (rank <= 5) {
    const basePrice = FANTASY_PRICE_BANDS.tier1.base;
    const bonus = Math.max(0, (6 - rank) * 1000); // 1st gets +5k, 5th gets +1k
    return Math.min(PRICE_CHANGE_CAPS.maxPrice, basePrice + bonus);
  }
  
  // Tier 2: Rank 6-15
  if (rank <= 15) {
    const basePrice = FANTASY_PRICE_BANDS.tier2.base;
    const bonus = Math.max(0, (16 - rank) * 200); // Gradual decrease
    return basePrice + bonus;
  }
  
  // Tier 3: Rank 16-30
  if (rank <= 30) {
    return FANTASY_PRICE_BANDS.tier3.base;
  }
  
  // Unranked/Lower: Rank 31+
  return FANTASY_PRICE_BANDS.unranked.base;
};

/**
 * Apply post-event price adjustment based on performance
 * 
 * @param currentPrice - Current fantasy price
 * @param position - Final position (null if didn't compete)
 * @param fieldSize - Size of the competition field
 * @returns Adjusted price
 */
export const adjustPriceAfterEvent = (
  currentPrice: number,
  position: number | null,
  fieldSize: number = 20
): number => {
  let adjustment = 0;
  
  if (position === null) {
    // Didn't compete / withdrew
    adjustment = EVENT_ADJUSTMENTS.noShow;
  } else if (position === 1) {
    adjustment = EVENT_ADJUSTMENTS.win;
  } else if (position === 2) {
    adjustment = EVENT_ADJUSTMENTS.second;
  } else if (position === 3) {
    adjustment = EVENT_ADJUSTMENTS.third;
  } else if (position <= 8) {
    adjustment = EVENT_ADJUSTMENTS.top8;
  } else if (position > Math.ceil(fieldSize * 0.6)) {
    // Bottom 40% of field
    adjustment = EVENT_ADJUSTMENTS.missedCut;
  } else {
    // Middle of pack - no change
    adjustment = 0;
  }
  
  // Cap the adjustment
  adjustment = Math.max(
    -PRICE_CHANGE_CAPS.maxDecrease,
    Math.min(PRICE_CHANGE_CAPS.maxIncrease, adjustment)
  );
  
  const newPrice = Math.round(currentPrice * (1 + adjustment));
  
  // Clamp to min/max
  return Math.max(
    PRICE_CHANGE_CAPS.minPrice,
    Math.min(PRICE_CHANGE_CAPS.maxPrice, newPrice)
  );
};

/**
 * Get tier from rank (for initial seeding)
 */
export const getTierFromRank = (rank: number | null): TierLevel => {
  if (!rank || rank <= 0) return 'unranked';
  if (rank <= 5) return 'tier1';
  if (rank <= 15) return 'tier2';
  if (rank <= 30) return 'tier3';
  return 'unranked';
};

/**
 * Format fantasy price for display
 */
export const formatFantasyPrice = (price: number): string => {
  if (price >= 1000) {
    return `${(price / 1000).toFixed(1)}k`;
  }
  return price.toString();
};
