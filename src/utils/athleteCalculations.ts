/**
 * Athlete Performance and Fantasy Value Calculations
 * Based on IWWF rankings and recent tournament results
 */

export type Discipline = 'slalom' | 'trick' | 'jump';

export interface AthleteResult {
  position: number | null;
  made_finals: boolean;
  missed_first_pass: boolean;
  missed_gate: boolean;
}

export interface PerformanceInputs {
  current_rank: number | null;
  recent_results: AthleteResult[];
  popularity_index: number;
  manual_boost_factor: number;
  injury_flag: boolean;
}

/**
 * Calculate rank score (0-1 scale)
 * Rank 1 → 1.0, rank 30 → 0.033, no rank → 0
 */
export const calculateRankScore = (rank: number | null): number => {
  if (!rank || rank < 1) return 0;
  if (rank > 30) return 0;
  return (31 - rank) / 30;
};

/**
 * Calculate event score from a single result (0-1 scale)
 */
export const calculateEventScore = (result: AthleteResult): number => {
  if (result.missed_first_pass) return 0;
  
  let score = 0;
  if (result.position && result.position > 0) {
    score = Math.max(0, (21 - result.position) / 20);
  } else {
    score = 0.3; // default for participation without position
  }
  
  // Penalties and bonuses
  if (result.missed_gate) {
    score = Math.max(0, score - 0.1);
  }
  
  if (result.made_finals) {
    score = Math.min(1.0, score + 0.1);
  }
  
  return score;
};

/**
 * Calculate recent performance score from last N results
 * Average of up to 3 most recent event scores
 */
export const calculateRecentPerformanceScore = (results: AthleteResult[]): number => {
  if (results.length === 0) return 0.3; // default baseline
  
  const eventScores = results.map(calculateEventScore);
  const sum = eventScores.reduce((acc, score) => acc + score, 0);
  return sum / eventScores.length;
};

/**
 * Calculate performance index (0-1 scale)
 * Combines ranking and recent results with adjustments
 */
export const calculatePerformanceIndex = (inputs: PerformanceInputs): number => {
  const rankScore = calculateRankScore(inputs.current_rank);
  const recentScore = calculateRecentPerformanceScore(inputs.recent_results.slice(0, 3));
  
  // Base index: 60% rank, 40% recent performance
  let baseIndex = 0.6 * rankScore + 0.4 * recentScore;
  
  // Bonus for winning most recent event
  if (inputs.recent_results.length > 0 && inputs.recent_results[0].position === 1) {
    baseIndex = Math.min(1.0, baseIndex + 0.1);
  }
  
  // Injury penalty
  if (inputs.injury_flag) {
    baseIndex *= 0.7;
  }
  
  // Manual boost factor
  baseIndex *= inputs.manual_boost_factor;
  
  // Clamp to 0-1
  return Math.max(0, Math.min(1, baseIndex));
};

/**
 * Calculate fantasy price in tokens
 * Base price scaled by performance and popularity
 */
export const calculateFantasyPrice = (
  performanceIndex: number,
  popularityIndex: number
): number => {
  const basePrice = 100;
  const price = Math.round(
    basePrice * (0.5 + 1.5 * performanceIndex + 0.5 * popularityIndex)
  );
  
  // Enforce min/max bounds
  return Math.max(50, Math.min(500, price));
};

/**
 * Calculate implied probability from performance index
 * Normalized within a field of athletes
 */
export const calculateImpliedProbability = (
  performanceIndex: number,
  allPerformanceIndices: number[]
): number => {
  const sum = allPerformanceIndices.reduce((acc, val) => acc + val, 0);
  if (sum === 0) {
    return 1 / allPerformanceIndices.length; // equal probability
  }
  return performanceIndex / sum;
};

/**
 * Convert implied probability to American odds
 */
export const probabilityToAmericanOdds = (probability: number): number => {
  if (probability >= 0.5) {
    return -Math.round((probability / (1 - probability)) * 100);
  } else {
    return Math.round(((1 - probability) / probability) * 100);
  }
};

/**
 * Calculate odds seed for an athlete in a specific field
 */
export const calculateOddsSeed = (
  performanceIndex: number,
  fieldPerformanceIndices: number[]
): string => {
  const impliedProb = calculateImpliedProbability(performanceIndex, fieldPerformanceIndices);
  const americanOdds = probabilityToAmericanOdds(impliedProb);
  
  return americanOdds > 0 ? `+${americanOdds}` : `${americanOdds}`;
};
