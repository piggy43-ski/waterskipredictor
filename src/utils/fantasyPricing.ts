/**
 * Fantasy Pricing Utilities
 * Calculate and update athlete fantasy prices based on rankings
 */

// Base prices by rank tier (in tokens)
export const BASE_PRICE_TIERS = {
  ELITE: { minRank: 1, maxRank: 5, minPrice: 15000, maxPrice: 20000 },
  HIGH: { minRank: 6, maxRank: 15, minPrice: 10000, maxPrice: 15000 },
  MEDIUM: { minRank: 16, maxRank: 30, minPrice: 6000, maxPrice: 10000 },
  LOW: { minRank: 31, maxRank: 50, minPrice: 3000, maxPrice: 6000 },
  DEFAULT: { minPrice: 2000, maxPrice: 3000 }
} as const;

/**
 * Calculate initial fantasy price based on world ranking
 */
export function calculateInitialPrice(rank: number | null): number {
  if (!rank) {
    return BASE_PRICE_TIERS.DEFAULT.minPrice;
  }

  // Elite tier (1-5)
  if (rank >= BASE_PRICE_TIERS.ELITE.minRank && rank <= BASE_PRICE_TIERS.ELITE.maxRank) {
    const position = rank - BASE_PRICE_TIERS.ELITE.minRank;
    const range = BASE_PRICE_TIERS.ELITE.maxPrice - BASE_PRICE_TIERS.ELITE.minPrice;
    const step = range / (BASE_PRICE_TIERS.ELITE.maxRank - BASE_PRICE_TIERS.ELITE.minRank);
    return Math.round(BASE_PRICE_TIERS.ELITE.maxPrice - (position * step));
  }

  // High tier (6-15)
  if (rank >= BASE_PRICE_TIERS.HIGH.minRank && rank <= BASE_PRICE_TIERS.HIGH.maxRank) {
    const position = rank - BASE_PRICE_TIERS.HIGH.minRank;
    const range = BASE_PRICE_TIERS.HIGH.maxPrice - BASE_PRICE_TIERS.HIGH.minPrice;
    const step = range / (BASE_PRICE_TIERS.HIGH.maxRank - BASE_PRICE_TIERS.HIGH.minRank);
    return Math.round(BASE_PRICE_TIERS.HIGH.maxPrice - (position * step));
  }

  // Medium tier (16-30)
  if (rank >= BASE_PRICE_TIERS.MEDIUM.minRank && rank <= BASE_PRICE_TIERS.MEDIUM.maxRank) {
    const position = rank - BASE_PRICE_TIERS.MEDIUM.minRank;
    const range = BASE_PRICE_TIERS.MEDIUM.maxPrice - BASE_PRICE_TIERS.MEDIUM.minPrice;
    const step = range / (BASE_PRICE_TIERS.MEDIUM.maxRank - BASE_PRICE_TIERS.MEDIUM.minRank);
    return Math.round(BASE_PRICE_TIERS.MEDIUM.maxPrice - (position * step));
  }

  // Low tier (31-50)
  if (rank >= BASE_PRICE_TIERS.LOW.minRank && rank <= BASE_PRICE_TIERS.LOW.maxRank) {
    const position = rank - BASE_PRICE_TIERS.LOW.minRank;
    const range = BASE_PRICE_TIERS.LOW.maxPrice - BASE_PRICE_TIERS.LOW.minPrice;
    const step = range / (BASE_PRICE_TIERS.LOW.maxRank - BASE_PRICE_TIERS.LOW.minRank);
    return Math.round(BASE_PRICE_TIERS.LOW.maxPrice - (position * step));
  }

  // Beyond rank 50
  return BASE_PRICE_TIERS.DEFAULT.minPrice;
}

// Price adjustment factors
export const PRICE_ADJUSTMENTS = {
  PODIUM_WIN: 1.15,      // +15% for winning
  PODIUM_2ND: 1.10,      // +10% for 2nd place
  PODIUM_3RD: 1.07,      // +7% for 3rd place
  MADE_FINALS: 1.03,     // +3% for making finals
  POOR_FINISH: 0.97,     // -3% for poor finish (11+)
  MISSED_FIRST_PASS: 0.92, // -8% for missed first pass
  MISSED_GATE: 0.95,     // -5% for missed gate
  MISSED_EVENT_DECAY: 0.99, // -1% per missed event
  POPULARITY_BOOST_HIGH: 1.02, // +2% if very popular
  POPULARITY_BOOST_LOW: 0.98,  // -2% if rarely picked
  MAX_PRICE: 25000,
  MIN_PRICE: 1000
} as const;

/**
 * Calculate price adjustment based on tournament result
 */
export function calculatePriceAdjustment(
  currentPrice: number,
  position: number | null,
  madeFinials: boolean,
  missedFirstPass: boolean,
  missedGate: boolean
): number {
  let multiplier = 1;

  // Position-based adjustments
  if (position !== null) {
    if (position === 1) {
      multiplier *= PRICE_ADJUSTMENTS.PODIUM_WIN;
    } else if (position === 2) {
      multiplier *= PRICE_ADJUSTMENTS.PODIUM_2ND;
    } else if (position === 3) {
      multiplier *= PRICE_ADJUSTMENTS.PODIUM_3RD;
    } else if (position > 10) {
      multiplier *= PRICE_ADJUSTMENTS.POOR_FINISH;
    }
  }

  // Finals bonus
  if (madeFinials) {
    multiplier *= PRICE_ADJUSTMENTS.MADE_FINALS;
  }

  // Penalties
  if (missedFirstPass) {
    multiplier *= PRICE_ADJUSTMENTS.MISSED_FIRST_PASS;
  }
  if (missedGate) {
    multiplier *= PRICE_ADJUSTMENTS.MISSED_GATE;
  }

  // Calculate new price with bounds
  const newPrice = Math.round(currentPrice * multiplier);
  return Math.max(
    PRICE_ADJUSTMENTS.MIN_PRICE,
    Math.min(PRICE_ADJUSTMENTS.MAX_PRICE, newPrice)
  );
}

/**
 * Apply missed event decay to price
 */
export function applyMissedEventDecay(currentPrice: number, missedCount: number): number {
  if (missedCount <= 0) return currentPrice;
  
  const decayMultiplier = Math.pow(PRICE_ADJUSTMENTS.MISSED_EVENT_DECAY, missedCount);
  const newPrice = Math.round(currentPrice * decayMultiplier);
  return Math.max(PRICE_ADJUSTMENTS.MIN_PRICE, newPrice);
}
