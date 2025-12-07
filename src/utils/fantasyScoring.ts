/**
 * Fantasy Scoring Utilities
 * F1-style scoring system for waterski fantasy
 */

import { 
  FANTASY_BONUSES, 
  FANTASY_PENALTIES,
  STREAK_MULTIPLIERS,
  getPositionPoints,
  getPodiumBonus,
  getStreakMultiplier
} from './fantasyConfig';

export interface AthleteResult {
  athlete_id: string;
  position: number | null;
  score_raw: number | null;
  made_finals: boolean;
  missed_first_pass: boolean;
  missed_gate: boolean;
  discipline: string;
  gender: string;
}

export interface ScoringBreakdown {
  positionPoints: number;
  bonuses: { type: string; points: number }[];
  penalties: { type: string; points: number }[];
  streakMultiplier: number;
  totalPoints: number;
}

/**
 * Calculate fantasy points for a single athlete result
 */
export function calculateAthleteFantasyPoints(
  result: AthleteResult,
  isHighestScore: boolean = false,
  consecutivePositiveEvents: number = 0
): ScoringBreakdown {
  let positionPoints = 0;
  const bonuses: { type: string; points: number }[] = [];
  const penalties: { type: string; points: number }[] = [];

  // Position points (only for finalists)
  if (result.made_finals && result.position !== null && result.position > 0) {
    positionPoints = getPositionPoints(result.position);
    
    // Podium bonus
    const podiumBonus = getPodiumBonus(result.position);
    if (podiumBonus > 0) {
      bonuses.push({ type: 'podium_bonus', points: podiumBonus });
    }
  }

  // Made finals bonus
  if (result.made_finals) {
    bonuses.push({ type: 'made_finals', points: FANTASY_BONUSES.made_finals });
  }

  // Highest score bonus
  if (isHighestScore) {
    bonuses.push({ type: 'highest_score', points: FANTASY_BONUSES.highest_score_event });
  }

  // Penalties
  if (!result.made_finals && result.position !== null) {
    // Started event but didn't make finals
    penalties.push({ type: 'did_not_make_finals', points: FANTASY_PENALTIES.did_not_make_finals });
  }

  if (result.missed_first_pass) {
    penalties.push({ type: 'missed_first_pass', points: FANTASY_PENALTIES.missed_first_pass });
  }

  if (result.missed_gate) {
    penalties.push({ type: 'missed_gate', points: FANTASY_PENALTIES.missed_gate });
  }

  // Calculate base total
  const bonusTotal = bonuses.reduce((sum, b) => sum + b.points, 0);
  const penaltyTotal = penalties.reduce((sum, p) => sum + p.points, 0);
  const basePoints = positionPoints + bonusTotal + penaltyTotal;

  // Calculate streak multiplier (only if positive points)
  let streakMultiplier = 1;
  let totalPoints = basePoints;

  if (basePoints > 0 && consecutivePositiveEvents >= 2) {
    streakMultiplier = getStreakMultiplier(consecutivePositiveEvents);
    totalPoints = Math.round(basePoints * streakMultiplier);
  }

  // Allow negative points (don't cap at 0)
  return {
    positionPoints,
    bonuses,
    penalties,
    streakMultiplier,
    totalPoints
  };
}

/**
 * Find highest scores by discipline/gender for bonus calculation
 */
export function findHighestScores(
  results: AthleteResult[]
): Map<string, { athlete_id: string; score: number }> {
  const highestByCategory = new Map<string, { athlete_id: string; score: number }>();

  for (const result of results) {
    if (result.score_raw === null) continue;

    const key = `${result.discipline}_${result.gender}`;
    const current = highestByCategory.get(key);

    if (!current || result.score_raw > current.score) {
      highestByCategory.set(key, {
        athlete_id: result.athlete_id,
        score: result.score_raw
      });
    }
  }

  return highestByCategory;
}

/**
 * Check if athlete has the highest score in their category
 */
export function isAthleteHighestScore(
  result: AthleteResult,
  highestScores: Map<string, { athlete_id: string; score: number }>
): boolean {
  const key = `${result.discipline}_${result.gender}`;
  const highest = highestScores.get(key);
  return highest?.athlete_id === result.athlete_id;
}
