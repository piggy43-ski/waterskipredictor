// Fantasy System Configuration Constants
// Phase 2: All configuration values for the fantasy scoring and pricing system

// Team budget in tokens
export const FANTASY_TEAM_BUDGET = 100_000;

// Maximum athletes per discipline (legacy - total per discipline)
export const FANTASY_ROSTER_LIMITS = {
  slalom: 12,  // 6 men + 6 women
  trick: 8,    // 4 men + 4 women
  jump: 10,    // 5 men + 5 women
} as const;

// Roster limits by gender and discipline
export const FANTASY_ROSTER_LIMITS_BY_GENDER = {
  slalom: { men: 6, women: 6 },
  trick: { men: 4, women: 4 },
  jump: { men: 5, women: 5 },
} as const;

// Helper to get required count by discipline and gender
export function getGenderRosterLimit(discipline: 'slalom' | 'trick' | 'jump', gender: 'men' | 'women'): number {
  return FANTASY_ROSTER_LIMITS_BY_GENDER[discipline][gender];
}

// Get total required roster size
export function getTotalRequiredRoster(): { men: number; women: number; total: number } {
  const men = FANTASY_ROSTER_LIMITS_BY_GENDER.slalom.men + 
              FANTASY_ROSTER_LIMITS_BY_GENDER.trick.men + 
              FANTASY_ROSTER_LIMITS_BY_GENDER.jump.men;
  const women = FANTASY_ROSTER_LIMITS_BY_GENDER.slalom.women + 
                FANTASY_ROSTER_LIMITS_BY_GENDER.trick.women + 
                FANTASY_ROSTER_LIMITS_BY_GENDER.jump.women;
  return { men, women, total: men + women };
}

// Season tier entry fees (in tokens)
export const SEASON_TIERS = {
  1: 1_000,    // Bronze tier
  2: 5_000,    // Silver tier  
  3: 25_000,   // Gold tier
} as const;

// F1-style position points
export const POSITION_POINTS = {
  1: 25,
  2: 18,
  3: 15,
  4: 12,
  5: 10,
  6: 8,
  7: 6,
  8: 4,
  9: 2,
  10: 1,
} as const;

// Bonus points
export const FANTASY_BONUSES = {
  highest_score: 5,      // Event's top score in discipline
  made_finals: 3,        // Made it to finals round
  personal_best: 2,      // Achieved a personal best
} as const;

// Penalty points
export const FANTASY_PENALTIES = {
  missed_finals: -2,       // Didn't make finals
  missed_first_pass: -5,   // Failed first pass in slalom
  missed_gate: -3,         // Missed a gate
  dns: -10,                // Did not start
  dsq: -8,                 // Disqualified
} as const;

// Streak multipliers
export const STREAK_MULTIPLIERS = {
  consecutive_podiums: 1.1,   // 10% bonus per consecutive podium
  consecutive_finals: 1.05,  // 5% bonus per consecutive finals appearance
} as const;

// Price change rules (for dynamic pricing)
export const PRICE_CHANGES = {
  performance_weight: 0.6,     // How much recent performance affects price
  popularity_weight: 0.2,      // How much popularity affects price
  form_weight: 0.2,            // How much current form affects price
  max_increase_percent: 15,    // Max price increase per event
  max_decrease_percent: 10,    // Max price decrease per event
  missed_event_decay: 0.95,    // Price multiplier when missing events
} as const;

// Default house rake (hidden from users)
export const DEFAULT_HOUSE_RAKE_PERCENT = 10;

// Payout structures
export const PAYOUT_STRUCTURES = {
  winner_takes_all: {
    1: 100,
  },
  top_3_split: {
    1: 50,
    2: 30,
    3: 20,
  },
  top_5_split: {
    1: 40,
    2: 25,
    3: 18,
    4: 10,
    5: 7,
  },
  top_10_split: {
    1: 30,
    2: 20,
    3: 15,
    4: 10,
    5: 8,
    6: 6,
    7: 4,
    8: 3,
    9: 2,
    10: 2,
  },
} as const;

// Discipline scopes for pots
export const DISCIPLINE_SCOPES = {
  all: ['slalom', 'trick', 'jump'],
  slalom_only: ['slalom'],
  trick_only: ['trick'],
  jump_only: ['jump'],
  combined: ['slalom', 'trick', 'jump'],
} as const;

// Pot types
export const POT_TYPES = {
  tournament: 'tournament',  // Single tournament pot
  season: 'season',          // Season-long pot
  private: 'private',        // Private pot with invite code
} as const;

// Pot visibility
export const POT_VISIBILITY = {
  public: 'public',
  private: 'private',
} as const;

// Pot statuses
export const POT_STATUS = {
  open: 'open',           // Accepting entries
  locked: 'locked',       // Entries closed, event in progress
  settled: 'settled',     // Payouts distributed
  cancelled: 'cancelled', // Pot cancelled, refunds issued
} as const;

// Helper functions
export function getPositionPoints(position: number): number {
  return POSITION_POINTS[position as keyof typeof POSITION_POINTS] ?? 0;
}

export function calculateFantasyScore(
  position: number,
  bonuses: (keyof typeof FANTASY_BONUSES)[] = [],
  penalties: (keyof typeof FANTASY_PENALTIES)[] = [],
  streakMultiplier: number = 1
): number {
  let score = getPositionPoints(position);
  
  // Add bonuses
  for (const bonus of bonuses) {
    score += FANTASY_BONUSES[bonus] ?? 0;
  }
  
  // Apply penalties
  for (const penalty of penalties) {
    score += FANTASY_PENALTIES[penalty] ?? 0;
  }
  
  // Apply streak multiplier
  score = Math.round(score * streakMultiplier);
  
  return Math.max(0, score); // Never go negative
}

export function calculatePriceChange(
  currentPrice: number,
  performanceIndex: number,
  popularityIndex: number,
  recentFormIndex: number
): number {
  const { performance_weight, popularity_weight, form_weight, max_increase_percent, max_decrease_percent } = PRICE_CHANGES;
  
  // Calculate weighted change factor (normalized around 1.0)
  const changeFactor = 
    (performanceIndex * performance_weight) +
    (popularityIndex * popularity_weight) +
    (recentFormIndex * form_weight);
  
  // Calculate percentage change
  let percentChange = (changeFactor - 1) * 100;
  
  // Clamp to max increase/decrease
  percentChange = Math.max(-max_decrease_percent, Math.min(max_increase_percent, percentChange));
  
  // Calculate new price
  const newPrice = Math.round(currentPrice * (1 + percentChange / 100));
  
  return Math.max(100, newPrice); // Minimum price of 100 tokens
}

export function getSeasonTierFee(tier: 1 | 2 | 3): number {
  return SEASON_TIERS[tier];
}

export function getRosterLimit(discipline: 'slalom' | 'trick' | 'jump'): number {
  return FANTASY_ROSTER_LIMITS[discipline];
}

export function getTotalRosterSize(): number {
  return Object.values(FANTASY_ROSTER_LIMITS).reduce((sum, limit) => sum + limit, 0);
}

export function getPayoutStructure(structureName: keyof typeof PAYOUT_STRUCTURES) {
  return PAYOUT_STRUCTURES[structureName];
}

export function calculatePayout(
  totalPool: number,
  position: number,
  structureName: keyof typeof PAYOUT_STRUCTURES = 'top_3_split'
): number {
  const structure = PAYOUT_STRUCTURES[structureName];
  const percentage = structure[position as keyof typeof structure];
  
  if (!percentage) return 0;
  
  return Math.floor(totalPool * (percentage / 100));
}