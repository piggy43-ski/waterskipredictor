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

// Season championship points (F1-style) awarded by a manager's FINISH in each
// tournament pot. Accumulate across the season; highest total wins the season grand prize.
export const SEASON_CHAMPIONSHIP_POINTS: Record<number, number> = {
  1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1,
};
// Flat points just for entering an event (rewards showing up every stop).
export const SEASON_PARTICIPATION_POINTS = 1;

export function getChampionshipPoints(rank: number): number {
  return SEASON_CHAMPIONSHIP_POINTS[rank] ?? 0;
}

// Position points for athletes who make the final
// Based on final_position (overall placing in that discipline+gender)
export const POSITION_POINTS = {
  1: 25,
  2: 20,
  3: 16,
  4: 13,
  5: 11,
  6: 9,
  7: 7,
  8: 5,
  9: 3,
  10: 3,
  11: 3,
  12: 3,
  // >12th in final
  default_finalist: 1,
} as const;

// Bonus points
export const FANTASY_BONUSES = {
  made_finals: 3,           // Made it to finals round
  highest_score_event: 5,   // Highest score across all rounds in discipline+gender
  podium_1st: 5,            // Extra bonus for 1st place
  podium_2nd: 3,            // Extra bonus for 2nd place
  podium_3rd: 1,            // Extra bonus for 3rd place
} as const;

// Penalty points
export const FANTASY_PENALTIES = {
  did_not_make_finals: -5,   // Started event but didn't make finals
  missed_first_pass: -10,    // Failed first pass in slalom
  missed_gate: -3,           // Missed a gate
  no_show: -50,              // DNS/DNF/DQ - no valid result
} as const;

// Streak multipliers (consecutive events with positive fantasy points)
export const STREAK_MULTIPLIERS = {
  consecutive_2: 1.10,   // 2nd consecutive positive event: +10%
  consecutive_3_plus: 1.20,  // 3rd+ consecutive positive event: +20% (capped)
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
  if (position >= 1 && position <= 12) {
    return POSITION_POINTS[position as keyof typeof POSITION_POINTS] ?? POSITION_POINTS.default_finalist;
  }
  // For positions >12 in finals, give minimum points
  if (position > 12) {
    return POSITION_POINTS.default_finalist;
  }
  return 0;
}

export function getPodiumBonus(position: number): number {
  if (position === 1) return FANTASY_BONUSES.podium_1st;
  if (position === 2) return FANTASY_BONUSES.podium_2nd;
  if (position === 3) return FANTASY_BONUSES.podium_3rd;
  return 0;
}

export function averageOverTiedSlots(
  startPosition: number,
  tieCount: number,
  pointsFor: (position: number) => number
): number {
  const n = Math.max(1, tieCount);
  let sum = 0;
  for (let p = startPosition; p < startPosition + n; p++) sum += pointsFor(p);
  return sum / n;
}

// DEPRECATED: streak multipliers removed in favour of season championship points.
export function getStreakMultiplier(_consecutivePositiveEvents: number): number {
  return 1.0;
}

export function calculateFantasyScore(
  position: number | null,
  madeFinalsFlag: boolean,
  isHighestScore: boolean,
  penalties: {
    didNotMakeFinals?: boolean;
    missedFirstPass?: boolean;
    missedGate?: boolean;
    noShow?: boolean;
  } = {},
  consecutivePositiveEvents: number = 0
): { rawPoints: number; finalPoints: number; breakdown: Record<string, number> } {
  let points = 0;
  const breakdown: Record<string, number> = {};

  // Check for no-show first (DNS/DNF/DQ)
  if (penalties.noShow) {
    points += FANTASY_PENALTIES.no_show;
    breakdown.no_show = FANTASY_PENALTIES.no_show;
    return { rawPoints: points, finalPoints: points, breakdown };
  }

  // Check if athlete didn't make finals (but started the event)
  if (penalties.didNotMakeFinals) {
    points += FANTASY_PENALTIES.did_not_make_finals;
    breakdown.did_not_make_finals = FANTASY_PENALTIES.did_not_make_finals;
    // They can still have other penalties
  }

  // Position points (only for finalists)
  if (madeFinalsFlag && position !== null && position > 0) {
    const positionPts = getPositionPoints(position);
    points += positionPts;
    breakdown.position = positionPts;

    // Podium bonus
    const podiumBonus = getPodiumBonus(position);
    if (podiumBonus > 0) {
      points += podiumBonus;
      breakdown.podium_bonus = podiumBonus;
    }
  }

  // Made finals bonus
  if (madeFinalsFlag) {
    points += FANTASY_BONUSES.made_finals;
    breakdown.made_finals = FANTASY_BONUSES.made_finals;
  }

  // Highest score bonus
  if (isHighestScore) {
    points += FANTASY_BONUSES.highest_score_event;
    breakdown.highest_score = FANTASY_BONUSES.highest_score_event;
  }

  // Apply penalties
  if (penalties.missedFirstPass) {
    points += FANTASY_PENALTIES.missed_first_pass;
    breakdown.missed_first_pass = FANTASY_PENALTIES.missed_first_pass;
  }
  if (penalties.missedGate) {
    points += FANTASY_PENALTIES.missed_gate;
    breakdown.missed_gate = FANTASY_PENALTIES.missed_gate;
  }

  const rawPoints = points;

  // Apply streak multiplier (only if positive points)
  let finalPoints = points;
  if (points > 0 && consecutivePositiveEvents >= 2) {
    const multiplier = getStreakMultiplier(consecutivePositiveEvents);
    finalPoints = Math.round(points * multiplier);
    breakdown.streak_multiplier = multiplier;
    breakdown.streak_bonus = finalPoints - rawPoints;
  }

  return { rawPoints, finalPoints, breakdown };
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
