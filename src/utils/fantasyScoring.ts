/**
 * Fantasy Scoring Utilities
 * F1-style scoring system for waterski fantasy
 */

import { 
  POSITION_POINTS, 
  FANTASY_BONUSES, 
  FANTASY_PENALTIES,
  STREAK_MULTIPLIERS,
  getPositionPoints 
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
  consecutivePodiums: number = 0,
  consecutiveFinals: number = 0
): ScoringBreakdown {
  let positionPoints = 0;
  const bonuses: { type: string; points: number }[] = [];
  const penalties: { type: string; points: number }[] = [];

  // Position points (F1 style)
  if (result.position !== null && result.position > 0) {
    positionPoints = getPositionPoints(result.position);
  }

  // Bonuses
  if (isHighestScore) {
    bonuses.push({ type: 'highest_score', points: FANTASY_BONUSES.highest_score });
  }

  if (result.made_finals) {
    bonuses.push({ type: 'made_finals', points: FANTASY_BONUSES.made_finals });
  }

  // Penalties
  if (!result.made_finals && result.position !== null) {
    penalties.push({ type: 'missed_finals', points: FANTASY_PENALTIES.missed_finals });
  }

  if (result.missed_first_pass) {
    penalties.push({ type: 'missed_first_pass', points: FANTASY_PENALTIES.missed_first_pass });
  }

  if (result.missed_gate) {
    penalties.push({ type: 'missed_gate', points: FANTASY_PENALTIES.missed_gate });
  }

  // Calculate streak multiplier
  let streakMultiplier = 1;
  if (result.position !== null && result.position <= 3 && consecutivePodiums > 0) {
    streakMultiplier *= Math.pow(STREAK_MULTIPLIERS.consecutive_podiums, consecutivePodiums);
  }
  if (result.made_finals && consecutiveFinals > 0) {
    streakMultiplier *= Math.pow(STREAK_MULTIPLIERS.consecutive_finals, consecutiveFinals);
  }

  // Calculate total
  const bonusTotal = bonuses.reduce((sum, b) => sum + b.points, 0);
  const penaltyTotal = penalties.reduce((sum, p) => sum + p.points, 0);
  const basePoints = positionPoints + bonusTotal + penaltyTotal;
  const totalPoints = Math.max(0, Math.round(basePoints * streakMultiplier));

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
