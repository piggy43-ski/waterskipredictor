/**
 * Odds Engine for Waterski Predictions
 * 
 * Uses current_rating (0-100 scale) to calculate probabilities and odds.
 * The rating combines: base_strength + form_boost - activity_decay
 * 
 * House edge is applied to ensure profitability.
 */

import { TierLevel, getTierBonus } from './athleteTiers';

export interface AthleteStrengthInputs {
  seasonPodiumRate: number;
  careerPodiumRate: number;
  seasonAvgPlace: number | null;
  tier: TierLevel;
  currentRating?: number; // 0-100 scale from database
}

export interface AthleteOddsData {
  id: string;
  name: string;
  strengthScore: number;
  probability: number;
  americanOdds: number;
  currentRating?: number;
}

/**
 * Calculate base strength score (0-1+ scale)
 * 
 * If currentRating is provided (from DB), use it directly (normalized to 0-1).
 * Otherwise, fall back to the formula-based calculation.
 */
export const calculateStrengthScore = (inputs: AthleteStrengthInputs): number => {
  // If we have a currentRating from the database, use it (normalized)
  if (inputs.currentRating !== undefined && inputs.currentRating > 0) {
    return inputs.currentRating / 100;
  }
  
  // Fallback to formula-based calculation
  const tierBonus = getTierBonus(inputs.tier);
  
  // For avg place: lower is better, so we invert it
  // If no avg place data, use a moderate default (0.1)
  const avgPlaceScore = inputs.seasonAvgPlace && inputs.seasonAvgPlace > 0
    ? Math.min(1, 1 / inputs.seasonAvgPlace)
    : 0.1;
  
  const score = (
    0.4 * inputs.seasonPodiumRate +
    0.2 * inputs.careerPodiumRate +
    0.2 * avgPlaceScore +
    0.2 * tierBonus
  );
  
  // Ensure minimum score for everyone
  return Math.max(0.05, score);
};

/**
 * Calculate strength score directly from current_rating
 * Simpler version for when we just have the rating
 */
export const ratingToStrengthScore = (currentRating: number): number => {
  return Math.max(0.05, currentRating / 100);
};

/**
 * Normalize strength scores to probabilities that sum to 1
 */
export const normalizeFieldProbabilities = (strengthScores: number[]): number[] => {
  const total = strengthScores.reduce((a, b) => a + b, 0);
  
  if (total === 0) {
    // Equal probability if no data
    return strengthScores.map(() => 1 / strengthScores.length);
  }
  
  return strengthScores.map(s => s / total);
};

/**
 * Convert probability to American odds with house edge
 * 
 * @param prob - Raw probability (0-1)
 * @param houseEdge - House edge/overround (default 10%)
 * @returns American odds (negative for favorites, positive for underdogs)
 */
export const probabilityToAmericanOdds = (
  prob: number,
  houseEdge: number = 0.10
): number => {
  // Apply house edge (makes all odds slightly worse for bettors)
  const adjustedProb = Math.min(0.95, Math.max(0.02, prob * (1 + houseEdge)));
  
  if (adjustedProb >= 0.5) {
    // Favorite: negative odds (e.g., -200 means bet $200 to win $100)
    const rawOdds = -(adjustedProb / (1 - adjustedProb)) * 100;
    // Round to nearest 5
    return Math.round(rawOdds / 5) * 5;
  } else {
    // Underdog: positive odds (e.g., +200 means bet $100 to win $200)
    const rawOdds = ((1 - adjustedProb) / adjustedProb) * 100;
    // Round to nearest 5
    return Math.round(rawOdds / 5) * 5;
  }
};

/**
 * Convert American odds to decimal odds
 */
export const americanToDecimalOdds = (american: number): number => {
  if (american >= 100) {
    return (american / 100) + 1;
  } else if (american <= -100) {
    return (100 / Math.abs(american)) + 1;
  }
  return 2.0; // Fallback for invalid odds
};

/**
 * Convert decimal odds to American odds
 */
export const decimalToAmericanOdds = (decimal: number): number => {
  if (decimal >= 2.0) {
    return Math.round((decimal - 1) * 100);
  } else if (decimal > 1.0) {
    return Math.round(-100 / (decimal - 1));
  }
  return 100; // Fallback
};

/**
 * Calculate odds for an entire tournament field
 * 
 * @param athletes - Array of athletes with their strength inputs
 * @param houseEdge - House edge percentage (default 10%)
 * @returns Map of athlete ID to odds data
 */
export const calculateFieldOdds = (
  athletes: Array<{
    id: string;
    name: string;
    inputs: AthleteStrengthInputs;
  }>,
  houseEdge: number = 0.10
): AthleteOddsData[] => {
  // Calculate strength scores
  const scores = athletes.map(a => ({
    ...a,
    strengthScore: calculateStrengthScore(a.inputs),
    currentRating: a.inputs.currentRating,
  }));
  
  // Normalize to probabilities
  const strengthScores = scores.map(s => s.strengthScore);
  const probabilities = normalizeFieldProbabilities(strengthScores);
  
  // Convert to American odds
  return scores.map((athlete, i) => ({
    id: athlete.id,
    name: athlete.name,
    strengthScore: athlete.strengthScore,
    probability: probabilities[i],
    americanOdds: probabilityToAmericanOdds(probabilities[i], houseEdge),
    currentRating: athlete.currentRating,
  }));
};

/**
 * Calculate odds from current_rating values directly
 * Simpler version that just uses ratings
 */
export const calculateFieldOddsFromRatings = (
  athletes: Array<{
    id: string;
    name: string;
    currentRating: number;
  }>,
  houseEdge: number = 0.10
): AthleteOddsData[] => {
  // Convert ratings to strength scores
  const scores = athletes.map(a => ({
    ...a,
    strengthScore: ratingToStrengthScore(a.currentRating),
  }));
  
  // Normalize to probabilities
  const strengthScores = scores.map(s => s.strengthScore);
  const probabilities = normalizeFieldProbabilities(strengthScores);
  
  // Convert to American odds
  return scores.map((athlete, i) => ({
    id: athlete.id,
    name: athlete.name,
    strengthScore: athlete.strengthScore,
    probability: probabilities[i],
    americanOdds: probabilityToAmericanOdds(probabilities[i], houseEdge),
    currentRating: athlete.currentRating,
  }));
};

/**
 * Format American odds for display
 */
export const formatAmericanOdds = (odds: number): string => {
  if (odds >= 0) {
    return `+${odds}`;
  }
  return `${odds}`;
};

/**
 * Calculate implied probability from American odds
 */
export const americanToImpliedProbability = (american: number): number => {
  if (american >= 100) {
    return 100 / (american + 100);
  } else if (american <= -100) {
    return Math.abs(american) / (Math.abs(american) + 100);
  }
  return 0.5;
};

/**
 * Calculate potential payout from American odds
 */
export const calculatePayout = (stake: number, americanOdds: number): number => {
  if (americanOdds >= 100) {
    return stake * (1 + americanOdds / 100);
  } else if (americanOdds <= -100) {
    return stake * (1 + 100 / Math.abs(americanOdds));
  }
  return stake * 2;
};
