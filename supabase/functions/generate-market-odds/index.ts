import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================
// CONFIGURATION CONSTANTS
// ============================================================

const SIMULATION_COUNT = 20000;
const SIMS = 20000;
const BANKROLL_UNIT = 100000;
const ODDS_MIN = 1.20;
const ODDS_MAX = 15.0;
const DEFAULT_MANUAL_MULTIPLIER = 1.0;
const PRIOR_BLEND_ALPHA = 0.20;  // 20% MC, 80% prior
const TEMP_REDUCTION_FACTOR = 0.90;
const MAX_CALIBRATION_ITERATIONS = 20;

// ============================================================
// BASE PROBABILITY FLOORS - Enforce minimum probabilities by rank
// These are scaled dynamically based on field size
// ============================================================
const BASE_PROBABILITY_FLOORS: Record<string, { rank1Min: number; rank2Min: number; rank3Min: number }> = {
  WINNER: {
    rank1Min: 0.25,  // Rank #1 must have at least 25% → max 4.0x (for 8-athlete field)
    rank2Min: 0.18,  // Rank #2 must have at least 18% → max 5.5x
    rank3Min: 0.12,  // Rank #3 must have at least 12% → max 8.3x
  },
  PODIUM: {
    rank1Min: 0.55,  // Rank #1 must have at least 55% → max 1.8x
    rank2Min: 0.45,  // Rank #2 must have at least 45% → max 2.2x
    rank3Min: 0.35,  // Rank #3 must have at least 35% → max 2.8x
  },
  HIGHEST_SCORE: {
    rank1Min: 0.22,  // Rank #1 must have at least 22% → max 4.5x
    rank2Min: 0.15,  // Rank #2 must have at least 15% → max 6.6x
    rank3Min: 0.10,  // Rank #3 must have at least 10% → max 10x
  },
};

// Base constraints for 8-athlete field - scaled for larger fields
const BASE_TOP3_CONSTRAINTS: Record<string, { top1Max: number; top2Max: number; top3Max: number }> = {
  WINNER: { top1Max: 4.0, top2Max: 6.0, top3Max: 8.0 },
  HIGHEST_SCORE: { top1Max: 4.5, top2Max: 6.5, top3Max: 9.0 },
  PODIUM: { top1Max: 2.2, top2Max: 2.8, top3Max: 3.5 },
};

// ============================================================
// DYNAMIC FLOOR SCALING - Adjust floors based on field size
// Larger fields need lower minimum probabilities to avoid
// implied sum exceeding 1.0
// ============================================================
const REFERENCE_FIELD_SIZE = 8;  // Floors are designed for 8-athlete fields
const MIN_SCALE_FACTOR = 0.35;   // Never scale below 35% of original floors

function getDynamicFloors(fieldSize: number, marketType: string): { rank1Min: number; rank2Min: number; rank3Min: number } {
  const base = BASE_PROBABILITY_FLOORS[marketType] || BASE_PROBABILITY_FLOORS.WINNER;
  
  if (fieldSize <= REFERENCE_FIELD_SIZE) {
    return base;  // Use full floors for small fields
  }
  
  // Scale down for larger fields: factor = 8/fieldSize, min 0.55 (increased to ensure favorites get proper odds)
  const scaleFactor = Math.max(REFERENCE_FIELD_SIZE / fieldSize, 0.55);
  
  console.log(`[DYNAMIC-FLOORS] fieldSize=${fieldSize}, scaleFactor=${scaleFactor.toFixed(3)}`);
  
  return {
    rank1Min: base.rank1Min * scaleFactor,
    rank2Min: base.rank2Min * scaleFactor,
    rank3Min: base.rank3Min * scaleFactor,
  };
}

function getDynamicConstraints(fieldSize: number, marketType: string): { top1Max: number; top2Max: number; top3Max: number } {
  const base = BASE_TOP3_CONSTRAINTS[marketType] || BASE_TOP3_CONSTRAINTS.WINNER;
  
  if (fieldSize <= REFERENCE_FIELD_SIZE) {
    return base;  // Use strict constraints for small fields
  }
  
  // Larger fields allow higher multipliers for favorites
  // inverseFactor: 15 athletes → 15/8 = 1.875, capped at 2.0
  const inverseFactor = Math.min(fieldSize / REFERENCE_FIELD_SIZE, 2.0);
  
  return {
    top1Max: Math.min(base.top1Max * inverseFactor, 10.0),
    top2Max: Math.min(base.top2Max * inverseFactor, 12.0),
    top3Max: Math.min(base.top3Max * inverseFactor, 15.0),
  };
}

// Safety caps - ONLY as final assertion, should rarely be hit
const MULTIPLIER_CAPS: Record<string, number> = {
  WINNER: 15.0,
  HIGHEST_SCORE: 12.0,
  PODIUM: 8.0,
};

// Initial temperatures for softmax (lower = sharper separation)
const INITIAL_TEMPERATURE: Record<string, number> = {
  WINNER: 5,
  HIGHEST_SCORE: 6,
  PODIUM: 4,
};

// House edge by market type
const HOUSE_EDGE: Record<string, number> = {
  WINNER: 0.10,
  PODIUM: 0.18,
  HIGHEST_SCORE: 0.14,
};

// Target implied sum bands
const IMPLIED_SUM_RANGES: Record<string, { min: number; max: number }> = {
  WINNER: { min: 0.90, max: 0.915 },
  PODIUM: { min: 0.84, max: 0.86 },
  HIGHEST_SCORE: { min: 0.87, max: 0.89 },
};

const SIGMA: Record<string, number> = { slalom: 6, trick: 10, jump: 8 };

// Odds ladder for rounding (extended for large fields)
const ODDS_LADDER = [
  1.20, 1.25, 1.30, 1.35, 1.40, 1.45, 1.50, 1.55, 1.60, 1.65, 1.70, 1.75, 1.80, 1.85, 1.90, 1.95,
  2.00, 2.10, 2.20, 2.30, 2.40, 2.50, 2.60, 2.70, 2.80, 2.90,
  3.00, 3.20, 3.40, 3.60, 3.80,
  4.00, 4.50, 5.00, 5.50, 6.00, 6.50, 7.00, 7.50, 8.00, 8.50, 9.00, 9.50, 10.00,
  11.00, 12.00, 13.00, 14.00, 15.00, 17.00, 20.00, 25.00, 30.00, 40.00, 50.00, 75.00, 100.00
];

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function roundToLadder(odds: number): number {
  if (odds <= ODDS_LADDER[0]) return ODDS_LADDER[0];
  if (odds >= ODDS_LADDER[ODDS_LADDER.length - 1]) return ODDS_LADDER[ODDS_LADDER.length - 1];
  
  for (let i = 0; i < ODDS_LADDER.length - 1; i++) {
    if (odds >= ODDS_LADDER[i] && odds < ODDS_LADDER[i + 1]) {
      const mid = (ODDS_LADDER[i] + ODDS_LADDER[i + 1]) / 2;
      return odds < mid ? ODDS_LADDER[i] : ODDS_LADDER[i + 1];
    }
  }
  return odds;
}

function clampOdds(odds: number, maxOdds: number = ODDS_MAX): number {
  return Math.max(ODDS_MIN, Math.min(maxOdds, odds));
}

function normalRandom(mu: number, sigma: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mu + sigma * z;
}

function weightedSampleWithoutReplacement(weights: number[], k: number): number[] {
  const indices: number[] = [];
  const remainingWeights = [...weights];
  const remainingIndices = weights.map((_, i) => i);

  for (let i = 0; i < k && remainingIndices.length > 0; i++) {
    const totalWeight = remainingWeights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    
    for (let j = 0; j < remainingWeights.length; j++) {
      random -= remainingWeights[j];
      if (random <= 0) {
        indices.push(remainingIndices[j]);
        remainingWeights.splice(j, 1);
        remainingIndices.splice(j, 1);
        break;
      }
    }
  }
  return indices;
}

// Audit log helper
async function writeAuditLog(supabase: any, entry: {
  actor_type: string;
  actor_id?: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  before_state?: any;
  after_state?: any;
  metadata?: any;
}) {
  try {
    await supabase.from('audit_logs').insert(entry);
  } catch (e) {
    console.error('[AUDIT] Failed to write log:', e);
  }
}

// ============================================================
// INTERFACES
// ============================================================

interface AthleteOddsInput {
  athleteId: string;
  rating: number;
  rank: number | null;
}

interface RawProbabilityResult {
  athleteId: string;
  rawProbability: number;
  winCount: number;
}

interface OddsResult {
  athleteId: string;
  powerScore: number;
  priorProbability: number;
  mcProbability: number;
  blendedProbability: number;
  normalizedProbability: number;
  fairOdds: number;
  adjustedProbability: number;
  finalOdds: number;
  manualMultiplier: number;
  rank: number | null;
}

// ============================================================
// POWER SCORE CALCULATION
// Uses a formula that ensures rank #1 > #2 > #3 without saturation
// ============================================================

function calculatePowerScore(rating: number, rank: number | null, maxRankInField: number = 50): number {
  let score = rating;
  
  if (rank !== null && rank > 0) {
    // Balanced formula: provides differentiation without overwhelming rating
    // Rank 1 → 20/1 = 20 bonus
    // Rank 2 → 20/2 = 10 bonus  
    // Rank 3 → 20/3 = 6.7 bonus
    // Rank 5 → 20/5 = 4 bonus
    // Rank 10 → 20/10 = 2 bonus
    // This differentiates ranks without making rank 1 too dominant
    const K = 20;
    const rawBonus = K / rank;
    const rankBonus = Math.min(rawBonus, 20); // Cap at 20 for rank 1
    score += rankBonus;
  }
  
  return Math.max(50, Math.min(120, score));
}

// ============================================================
// PRIOR PROBABILITY CALCULATION (Numerically Stable Softmax)
// ============================================================

function calculatePriorProbabilities(
  athletes: { athleteId: string; powerScore: number; rank: number | null }[],
  temperature: number
): Map<string, number> {
  const maxPowerScore = Math.max(...athletes.map(a => a.powerScore));
  const skills = athletes.map(a => Math.exp((a.powerScore - maxPowerScore) / temperature));
  const totalSkill = skills.reduce((a, b) => a + b, 0);
  
  const priorMap = new Map<string, number>();
  athletes.forEach((a, i) => {
    priorMap.set(a.athleteId, skills[i] / totalSkill);
  });
  
  console.log(`[PRIOR] maxPowerScore=${maxPowerScore.toFixed(1)}, temp=${temperature.toFixed(2)}`);
  
  return priorMap;
}

// ============================================================
// MONTE CARLO SIMULATIONS
// ============================================================

function calculateWinnerProbabilities(athletes: AthleteOddsInput[], temperature: number, maxRankInField: number): RawProbabilityResult[] {
  const powerScores = athletes.map(a => calculatePowerScore(a.rating, a.rank, maxRankInField));
  const maxPowerScore = Math.max(...powerScores);
  const strengths = powerScores.map(ps => Math.exp((ps - maxPowerScore) / temperature));
  const totalStrength = strengths.reduce((a, b) => a + b, 0);
  
  return athletes.map((athlete, i) => ({
    athleteId: athlete.athleteId,
    rawProbability: strengths[i] / totalStrength,
    winCount: Math.round((strengths[i] / totalStrength) * SIMS),
  }));
}

function calculatePodiumProbabilities(athletes: AthleteOddsInput[], temperature: number, sims: number, maxRankInField: number): RawProbabilityResult[] {
  const powerScores = athletes.map(a => calculatePowerScore(a.rating, a.rank, maxRankInField));
  const maxPowerScore = Math.max(...powerScores);
  const weights = powerScores.map(ps => Math.exp((ps - maxPowerScore) / temperature));
  const top3Counts = new Map<string, number>();
  
  for (const athlete of athletes) {
    top3Counts.set(athlete.athleteId, 0);
  }

  for (let sim = 0; sim < sims; sim++) {
    const top3Indices = weightedSampleWithoutReplacement(weights, 3);
    for (const idx of top3Indices) {
      const athleteId = athletes[idx].athleteId;
      top3Counts.set(athleteId, (top3Counts.get(athleteId) || 0) + 1);
    }
  }

  return athletes.map(athlete => ({
    athleteId: athlete.athleteId,
    rawProbability: (top3Counts.get(athlete.athleteId) || 0) / sims,
    winCount: top3Counts.get(athlete.athleteId) || 0,
  }));
}

function calculateHighestScoreProbabilities(athletes: AthleteOddsInput[], sigma: number, sims: number, maxRankInField: number): RawProbabilityResult[] {
  const winCounts = new Map<string, number>();
  
  for (const athlete of athletes) {
    winCounts.set(athlete.athleteId, 0);
  }

  for (let sim = 0; sim < sims; sim++) {
    let maxScore = -Infinity;
    let winnerId = "";
    
    for (const athlete of athletes) {
      const powerScore = calculatePowerScore(athlete.rating, athlete.rank, maxRankInField);
      const score = normalRandom(powerScore, sigma);
      if (score > maxScore) {
        maxScore = score;
        winnerId = athlete.athleteId;
      }
    }
    
    if (winnerId) {
      winCounts.set(winnerId, (winCounts.get(winnerId) || 0) + 1);
    }
  }

  return athletes.map(athlete => ({
    athleteId: athlete.athleteId,
    rawProbability: (winCounts.get(athlete.athleteId) || 0) / sims,
    winCount: winCounts.get(athlete.athleteId) || 0,
  }));
}

// ============================================================
// PROBABILITY FLOORS ENFORCEMENT (with dynamic scaling)
// This is the CORE fix: enforce floors BEFORE normalization
// ALSO: Enforce monotonic ordering: p(rank1) >= p(rank2) >= p(rank3)
// ============================================================

function applyProbabilityFloors(
  athletes: { athleteId: string; rank: number | null; rawProb: number; rating?: number }[],
  marketType: string,
  fieldSize: number
): Map<string, number> {
  // Get dynamic floors based on field size
  const floors = getDynamicFloors(fieldSize, marketType);
  
  console.log(`[FLOORS] Using dynamic floors for ${fieldSize} athletes: rank1=${(floors.rank1Min*100).toFixed(1)}%, rank2=${(floors.rank2Min*100).toFixed(1)}%, rank3=${(floors.rank3Min*100).toFixed(1)}%`);
  
  // CRITICAL FIX: Sort by FIELD POSITION, not absolute world rank
  // 1. Athletes with world ranks come first (by rank ascending)
  // 2. Unranked athletes sorted by rating (descending)
  // This ensures the best athlete IN THE FIELD gets floor 1, not just world rank #1
  const sorted = [...athletes].sort((a, b) => {
    const aHasRank = a.rank !== null && a.rank < 900;
    const bHasRank = b.rank !== null && b.rank < 900;
    
    if (aHasRank && bHasRank) {
      return a.rank! - b.rank!;  // Both ranked: lower rank = better
    }
    if (aHasRank && !bHasRank) return -1;  // Ranked before unranked
    if (!aHasRank && bHasRank) return 1;   // Unranked after ranked
    // Both unranked: higher rating = better
    return (b.rating ?? 0) - (a.rating ?? 0);
  });
  
  // Top 3 IN THE FIELD (not by world rank value)
  const fieldTop1 = sorted[0];
  const fieldTop2 = sorted[1];
  const fieldTop3 = sorted[2];
  
  console.log(`[FLOORS] Field top 3: ` +
    `1st=${fieldTop1?.athleteId.slice(0,8)} (world rank ${fieldTop1?.rank ?? 'unranked'}, rating ${fieldTop1?.rating ?? '?'}), ` +
    `2nd=${fieldTop2?.athleteId.slice(0,8)} (world rank ${fieldTop2?.rank ?? 'unranked'}, rating ${fieldTop2?.rating ?? '?'}), ` +
    `3rd=${fieldTop3?.athleteId.slice(0,8)} (world rank ${fieldTop3?.rank ?? 'unranked'}, rating ${fieldTop3?.rating ?? '?'})`
  );
  
  // Calculate initial probabilities with floors applied
  // But CAP each athlete's probability to prevent extreme concentration
  const MAX_PROB_CAP = 0.40; // No single athlete can have more than 40%
  
  let prob1 = fieldTop1 ? Math.min(MAX_PROB_CAP, Math.max(fieldTop1.rawProb, floors.rank1Min)) : 0;
  let prob2 = fieldTop2 ? Math.min(MAX_PROB_CAP, Math.max(fieldTop2.rawProb, floors.rank2Min)) : 0;
  let prob3 = fieldTop3 ? Math.min(MAX_PROB_CAP, Math.max(fieldTop3.rawProb, floors.rank3Min)) : 0;
  
  // ENFORCE MONOTONIC ORDERING: fieldTop1 >= fieldTop2 >= fieldTop3
  const EPSILON = 0.02; // Small gap to ensure strict ordering
  
  if (prob2 > prob1 - EPSILON) {
    prob2 = Math.max(prob1 - EPSILON, floors.rank2Min);
  }
  if (prob3 > prob2 - EPSILON) {
    prob3 = Math.max(prob2 - EPSILON, floors.rank3Min);
  }
  
  // Ensure probabilities don't go below floors
  prob1 = Math.max(prob1, floors.rank1Min);
  prob2 = Math.max(prob2, floors.rank2Min);
  prob3 = Math.max(prob3, floors.rank3Min);
  
  // Calculate sum of top 3
  let top3Sum = prob1 + prob2 + prob3;
  
  console.log(`[FLOORS] Top 3 ordered probs: field1=${(prob1*100).toFixed(1)}%, field2=${(prob2*100).toFixed(1)}%, field3=${(prob3*100).toFixed(1)}%, sum=${(top3Sum*100).toFixed(1)}%`);
  
  // If top3 sum exceeds target (based on field size), scale down
  // Leave at least 15% for the rest of the field
  const maxTop3Sum = Math.min(0.85, 0.60 + (0.02 * (10 - fieldSize)));
  
  if (top3Sum > maxTop3Sum && fieldSize > 3) {
    const scaleFactor = maxTop3Sum / top3Sum;
    prob1 *= scaleFactor;
    prob2 *= scaleFactor;
    prob3 *= scaleFactor;
    top3Sum = prob1 + prob2 + prob3;
    console.log(`[FLOORS] Scaled top3 down by ${scaleFactor.toFixed(2)}, new sum=${(top3Sum*100).toFixed(1)}%`);
  }
  
  // Set top 3 probabilities
  const probMap = new Map<string, number>();
  if (fieldTop1) probMap.set(fieldTop1.athleteId, prob1);
  if (fieldTop2) probMap.set(fieldTop2.athleteId, prob2);
  if (fieldTop3) probMap.set(fieldTop3.athleteId, prob3);
  
  // Calculate remaining probability mass after top 3
  const remainingMass = Math.max(0.05, 1 - top3Sum);
  
  // Get non-top3 athletes
  const restAthletes = sorted.slice(3);
  const restRawSum = restAthletes.reduce((sum, a) => sum + a.rawProb, 0);
  
  // Distribute remaining mass proportionally based on raw probabilities
  for (const athlete of restAthletes) {
    const proportion = restRawSum > 0 ? athlete.rawProb / restRawSum : 1 / restAthletes.length;
    const adjustedProb = remainingMass * proportion;
    probMap.set(athlete.athleteId, Math.max(0.005, adjustedProb));
  }
  
  // Final normalization to ensure sum = 1.0
  const total = Array.from(probMap.values()).reduce((sum, p) => sum + p, 0);
  for (const [id, prob] of probMap) {
    probMap.set(id, prob / total);
  }
  
  // Log final top 3 for verification
  const finalTop3 = sorted.slice(0, 3).map(a => ({
    rank: a.rank,
    rating: a.rating,
    prob: probMap.get(a.athleteId) || 0
  }));
  console.log(`[FLOORS] Final top 3 (by field position): ${finalTop3.map(t => `rank${t.rank ?? 'unranked'}(r${t.rating ?? '?'})=${(t.prob*100).toFixed(1)}%`).join(', ')}`);
  
  return probMap;
}

// ============================================================
// PROBABILITY BLENDING (Prior + MC)
// ============================================================

function blendProbabilities(
  priorProbs: Map<string, number>,
  mcProbs: Map<string, number>,
  alpha: number
): Map<string, number> {
  const blended = new Map<string, number>();
  
  for (const [athleteId, mcProb] of mcProbs) {
    const priorProb = priorProbs.get(athleteId) || mcProb;
    const blendedProb = alpha * mcProb + (1 - alpha) * priorProb;
    blended.set(athleteId, blendedProb);
  }
  
  const total = Array.from(blended.values()).reduce((a, b) => a + b, 0);
  for (const [athleteId, prob] of blended) {
    blended.set(athleteId, prob / total);
  }
  
  return blended;
}

// ============================================================
// DERIVE ODDS FROM PROBABILITIES (NO CLIPPING)
// ============================================================

function deriveOddsFromProbabilities(
  athletes: AthleteOddsInput[],
  priorProbs: Map<string, number>,
  mcProbs: Map<string, number>,
  flooredProbs: Map<string, number>,
  multiplierMap: Map<string, number>,
  maxRankInField: number
): OddsResult[] {
  return athletes.map(athlete => {
    const powerScore = calculatePowerScore(athlete.rating, athlete.rank, maxRankInField);
    const priorProb = priorProbs.get(athlete.athleteId) || 0.01;
    const mcProb = mcProbs.get(athlete.athleteId) || 0.01;
    const flooredProb = flooredProbs.get(athlete.athleteId) || 0.01;
    
    // Fair odds directly from probability (NO CLIPPING)
    const fairOdds = 1 / flooredProb;
    
    // Apply manual multiplier if any
    const manualMultiplier = multiplierMap.get(athlete.athleteId) ?? DEFAULT_MANUAL_MULTIPLIER;
    const adjustedOdds = fairOdds * manualMultiplier;
    
    // Round to ladder (but do NOT cap yet)
    const finalOdds = roundToLadder(Math.max(ODDS_MIN, adjustedOdds));
    
    return {
      athleteId: athlete.athleteId,
      powerScore,
      priorProbability: priorProb,
      mcProbability: mcProb,
      blendedProbability: flooredProb,
      normalizedProbability: flooredProb,
      fairOdds,
      adjustedProbability: 1 / finalOdds,
      finalOdds,
      manualMultiplier,
      rank: athlete.rank,
    };
  });
}

// ============================================================
// ENFORCE TARGET IMPLIED SUM (House Edge)
// Apply house edge in PROBABILITY SPACE, then derive odds
// This ensures implied sum is exactly correct before any rounding
// ============================================================

function enforceTargetImpliedSum(
  results: OddsResult[],
  targetImpliedSum: number,
  maxMultiplier: number
): { correctedResults: OddsResult[]; scalingFactor: number; finalImpliedSum: number } {
  
  // CRITICAL FIX: Use adjustedProbability from the CALIBRATED results (1/finalOdds)
  // NOT blendedProbability which is raw MC output
  
  // First, calculate implied sum from the current odds (after calibration/flooring)
  const currentImpliedSum = results.reduce((sum, r) => sum + (1 / r.finalOdds), 0);
  
  console.log(`[ENFORCE] Initial: implied_sum=${currentImpliedSum.toFixed(4)}, target=${targetImpliedSum.toFixed(4)}`);
  
  // If we're already close enough, just return
  if (Math.abs(currentImpliedSum - targetImpliedSum) < 0.02) {
    console.log(`[ENFORCE] Already within tolerance, skipping adjustment`);
    return {
      correctedResults: results,
      scalingFactor: 1.0,
      finalImpliedSum: currentImpliedSum
    };
  }
  
  // Calculate the scaling factor needed
  // We want: sum(1/newOdds) = targetImpliedSum
  // If currentImpliedSum > target, we need to INCREASE odds (decrease probability)
  // If currentImpliedSum < target, we need to DECREASE odds (increase probability)
  const scalingFactor = currentImpliedSum / targetImpliedSum;
  
  console.log(`[ENFORCE] Scaling odds by factor ${scalingFactor.toFixed(4)} (>1 means higher odds/lower prob)`);
  
  // Apply scaling to odds
  const scaledResults = results.map(r => {
    // Scale the odds
    let newOdds = r.finalOdds * scalingFactor;
    
    // Apply reasonable bounds (but don't hard-clamp at maxMultiplier which causes bloat)
    newOdds = Math.max(ODDS_MIN, newOdds);
    
    // Only apply max cap if the original calibrated odds were below it
    // This prevents inflating already-good favorites
    if (r.finalOdds <= maxMultiplier) {
      newOdds = Math.min(newOdds, maxMultiplier);
    }
    
    // Round to ladder
    const roundedOdds = roundToLadder(newOdds);
    
    return {
      ...r,
      finalOdds: roundedOdds,
      adjustedProbability: 1 / roundedOdds
    };
  });
  
  const finalImpliedSum = scaledResults.reduce((sum, r) => sum + (1 / r.finalOdds), 0);
  
  console.log(`[ENFORCE] After scaling: implied_sum=${finalImpliedSum.toFixed(4)}`);
  
  return {
    correctedResults: scaledResults,
    scalingFactor,
    finalImpliedSum
  };
}

// ============================================================
// VALIDATION ASSERTIONS (Fail Fast)
// ============================================================

function validateConstraints(
  results: OddsResult[],
  marketType: string,
  fieldSize: number
): { passed: boolean; errors: string[] } {
  // Get dynamic constraints based on field size
  const constraints = getDynamicConstraints(fieldSize, marketType);
  
  console.log(`[VALIDATE] Dynamic constraints for ${fieldSize} athletes: top1Max=${constraints.top1Max.toFixed(1)}, top2Max=${constraints.top2Max.toFixed(1)}, top3Max=${constraints.top3Max.toFixed(1)}`);
  
  // CRITICAL FIX: Sort by FIELD POSITION, not absolute world rank
  // Same logic as applyProbabilityFloors - ranked athletes first, then by rating
  const sorted = [...results].sort((a, b) => {
    const aHasRank = a.rank !== null && a.rank < 900;
    const bHasRank = b.rank !== null && b.rank < 900;
    
    if (aHasRank && bHasRank) {
      return a.rank! - b.rank!;  // Both ranked: lower rank = better
    }
    if (aHasRank && !bHasRank) return -1;  // Ranked before unranked
    if (!aHasRank && bHasRank) return 1;   // Unranked after ranked
    // Both unranked: compare by rating (need to access from original data)
    // Since we don't have rating in OddsResult, use powerScore as proxy
    return (b.powerScore ?? 0) - (a.powerScore ?? 0);
  });
  
  const errors: string[] = [];
  
  // Top 3 IN THE FIELD (not by world rank value)
  const fieldTop1 = sorted[0];
  const fieldTop2 = sorted[1];
  const fieldTop3 = sorted[2];
  
  console.log(`[VALIDATE] Field top 3: 1st=${fieldTop1?.athleteId.slice(0,8)} (rank ${fieldTop1?.rank}, odds ${fieldTop1?.finalOdds.toFixed(2)}x), 2nd=${fieldTop2?.athleteId.slice(0,8)} (rank ${fieldTop2?.rank}, odds ${fieldTop2?.finalOdds.toFixed(2)}x), 3rd=${fieldTop3?.athleteId.slice(0,8)} (rank ${fieldTop3?.rank}, odds ${fieldTop3?.finalOdds.toFixed(2)}x)`);
  
  if (fieldTop1 && fieldTop1.finalOdds > constraints.top1Max) {
    errors.push(`Field #1 (world rank ${fieldTop1.rank}) multiplier ${fieldTop1.finalOdds.toFixed(2)}x exceeds max ${constraints.top1Max.toFixed(1)}x`);
  }
  if (fieldTop2 && fieldTop2.finalOdds > constraints.top2Max) {
    errors.push(`Field #2 (world rank ${fieldTop2.rank}) multiplier ${fieldTop2.finalOdds.toFixed(2)}x exceeds max ${constraints.top2Max.toFixed(1)}x`);
  }
  if (fieldTop3 && fieldTop3.finalOdds > constraints.top3Max) {
    errors.push(`Field #3 (world rank ${fieldTop3.rank}) multiplier ${fieldTop3.finalOdds.toFixed(2)}x exceeds max ${constraints.top3Max.toFixed(1)}x`);
  }
  
  return {
    passed: errors.length === 0,
    errors
  };
}

// ============================================================
// MAIN CALIBRATION LOOP
// ============================================================

function calibrateOdds(
  athletes: AthleteOddsInput[],
  marketType: string,
  sigma: number,
  houseEdge: number,
  multiplierMap: Map<string, number>
): { results: OddsResult[]; temperatureUsed: number; iterations: number; calibrationPassed: boolean; errors: string[] } {
  const maxMultiplier = MULTIPLIER_CAPS[marketType] || 15.0;
  let temperature = INITIAL_TEMPERATURE[marketType] || 5;
  const maxRankInField = Math.max(...athletes.map(a => a.rank || 1), 50);
  const fieldSize = athletes.length;
  
  console.log(`[CALIBRATION] Starting: marketType=${marketType}, athletes=${fieldSize}, temp=${temperature}`);
  
  for (let iter = 0; iter < MAX_CALIBRATION_ITERATIONS; iter++) {
    // 1. Calculate power scores
    const athletesWithPower = athletes.map(a => ({
      athleteId: a.athleteId,
      powerScore: calculatePowerScore(a.rating, a.rank, maxRankInField),
      rank: a.rank
    }));
    
    // 2. Calculate prior probabilities
    const priorProbs = calculatePriorProbabilities(athletesWithPower, temperature);
    
    // 3. Run Monte Carlo
    let mcRaw: RawProbabilityResult[];
    switch (marketType) {
      case "WINNER":
        mcRaw = calculateWinnerProbabilities(athletes, temperature, maxRankInField);
        break;
      case "PODIUM":
        mcRaw = calculatePodiumProbabilities(athletes, temperature, SIMS, maxRankInField);
        break;
      case "HIGHEST_SCORE":
        mcRaw = calculateHighestScoreProbabilities(athletes, sigma, SIMS, maxRankInField);
        break;
      default:
        mcRaw = calculateWinnerProbabilities(athletes, temperature, maxRankInField);
    }
    
    // Normalize MC
    const mcSum = mcRaw.reduce((sum, r) => sum + r.rawProbability, 0);
    const mcProbs = new Map<string, number>();
    mcRaw.forEach(r => mcProbs.set(r.athleteId, r.rawProbability / mcSum));
    
    // 4. Blend prior + MC
    const blendedProbs = blendProbabilities(priorProbs, mcProbs, PRIOR_BLEND_ALPHA);
    
    // 5. Apply probability floors (with dynamic scaling based on field size)
    // CRITICAL: Include rating for proper field position sorting when ranks are missing/tied
    const athletesForFloors = athletes.map(a => ({
      athleteId: a.athleteId,
      rank: a.rank,
      rawProb: blendedProbs.get(a.athleteId) || 0.01,
      rating: a.rating  // Pass rating for tie-breaking unranked athletes
    }));
    const flooredProbs = applyProbabilityFloors(athletesForFloors, marketType, fieldSize);
    
    // 6. Derive odds from floored probabilities
    let results = deriveOddsFromProbabilities(
      athletes, priorProbs, mcProbs, flooredProbs, multiplierMap, maxRankInField
    );
    
    // 7. Sort by rank for constraint checking
    results.sort((a, b) => {
      const rankA = a.rank ?? 999;
      const rankB = b.rank ?? 999;
      return rankA - rankB;
    });
    
    // 8. Validate constraints (with dynamic scaling based on field size)
    const validation = validateConstraints(results, marketType, fieldSize);
    
    const top1 = results[0];
    const top2 = results[1];
    const top3 = results[2];
    
    console.log(`[CALIBRATION] Iter ${iter + 1}: temp=${temperature.toFixed(2)}, top1=${top1?.finalOdds.toFixed(2)}x, top2=${top2?.finalOdds.toFixed(2)}x, top3=${top3?.finalOdds.toFixed(2)}x, passed=${validation.passed}`);
    
    if (validation.passed) {
      console.log(`[CALIBRATION] ✓ Passed on iteration ${iter + 1}`);
      return { results, temperatureUsed: temperature, iterations: iter + 1, calibrationPassed: true, errors: [] };
    }
    
    // Reduce temperature (strengthen favorites)
    temperature = temperature * TEMP_REDUCTION_FACTOR;
  }
  
  // Final attempt with lowest temperature
  const athletesWithPower = athletes.map(a => ({
    athleteId: a.athleteId,
    powerScore: calculatePowerScore(a.rating, a.rank, maxRankInField),
    rank: a.rank
  }));
  const priorProbs = calculatePriorProbabilities(athletesWithPower, temperature);
  
  let mcRaw: RawProbabilityResult[];
  switch (marketType) {
    case "WINNER": mcRaw = calculateWinnerProbabilities(athletes, temperature, maxRankInField); break;
    case "PODIUM": mcRaw = calculatePodiumProbabilities(athletes, temperature, SIMS, maxRankInField); break;
    case "HIGHEST_SCORE": mcRaw = calculateHighestScoreProbabilities(athletes, sigma, SIMS, maxRankInField); break;
    default: mcRaw = calculateWinnerProbabilities(athletes, temperature, maxRankInField);
  }
  
  const mcSum = mcRaw.reduce((sum, r) => sum + r.rawProbability, 0);
  const mcProbs = new Map<string, number>();
  mcRaw.forEach(r => mcProbs.set(r.athleteId, r.rawProbability / mcSum));
  
  const blendedProbs = blendProbabilities(priorProbs, mcProbs, PRIOR_BLEND_ALPHA);
  const athletesForFloors = athletes.map(a => ({
    athleteId: a.athleteId,
    rank: a.rank,
    rawProb: blendedProbs.get(a.athleteId) || 0.01,
    rating: a.rating  // Pass rating for tie-breaking unranked athletes
  }));
  const flooredProbs = applyProbabilityFloors(athletesForFloors, marketType, fieldSize);
  
  let results = deriveOddsFromProbabilities(
    athletes, priorProbs, mcProbs, flooredProbs, multiplierMap, maxRankInField
  );
  results.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  
  const finalValidation = validateConstraints(results, marketType, fieldSize);
  
  console.warn(`[CALIBRATION] ✗ BLOCKED: Failed after ${MAX_CALIBRATION_ITERATIONS} iterations`);
  
  return {
    results,
    temperatureUsed: temperature,
    iterations: MAX_CALIBRATION_ITERATIONS,
    calibrationPassed: finalValidation.passed,
    errors: finalValidation.errors
  };
}

// ============================================================
// MAIN HANDLER
// ============================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { market_id, force = false } = await req.json();

    if (!market_id) {
      return new Response(
        JSON.stringify({ error: "market_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if market is frozen
    const { data: existingOdds } = await supabase
      .from("market_odds")
      .select("is_frozen")
      .eq("market_id", market_id)
      .limit(1);

    if (existingOdds && existingOdds.length > 0 && existingOdds[0].is_frozen && !force) {
      return new Response(
        JSON.stringify({ error: "Market is frozen. Use force=true to override." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get market details
    const { data: market, error: marketError } = await supabase
      .from("markets")
      .select("id, discipline, category, market_type, tournament_id")
      .eq("id", market_id)
      .single();

    if (marketError || !market) {
      return new Response(
        JSON.stringify({ error: "Market not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const gender = market.category === 'open_men' ? 'male' : 'female';
    const disciplineLower = market.discipline.toLowerCase();
    const marketType = market.market_type.toUpperCase();

    // Get athletes from tournament_entries WITH cached rank/rating data
    const { data: tournamentEntries, error: entriesError } = await supabase
      .from("tournament_entries")
      .select(`
        athlete_id,
        discipline_rank,
        rating_0_100,
        seed_rank,
        athletes!inner (
          id,
          gender,
          current_rating_slalom,
          current_rating_trick,
          current_rating_jump,
          current_rank_slalom,
          current_rank_trick,
          current_rank_jump
        )
      `)
      .eq("tournament_id", market.tournament_id)
      .eq("discipline", market.discipline);

    if (entriesError) throw entriesError;

    const filteredEntries = (tournamentEntries || []).filter((e: any) => 
      e.athletes?.gender === gender
    );

    let athleteInputs: AthleteOddsInput[];
    
    if (filteredEntries.length === 0) {
      console.log(`[GENERATE] No tournament_entries found, falling back to selections`);
      
      const { data: marketSelections, error: selectionsError } = await supabase
        .from("selections")
        .select("athlete_id")
        .eq("market_id", market_id);

      if (selectionsError) throw selectionsError;
      if (!marketSelections || marketSelections.length === 0) {
        await supabase.from('markets').update({
          odds_validation_status: 'MISSING',
          odds_validation_error: 'No athletes found for market'
        }).eq('id', market_id);
        
        return new Response(
          JSON.stringify({ error: "No athletes found for market" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const athleteIds = [...new Set(marketSelections.map(s => s.athlete_id))];
      const { data: fallbackAthletes, error: athletesError } = await supabase
        .from("athletes")
        .select("id, current_rating_slalom, current_rating_trick, current_rating_jump, current_rank_slalom, current_rank_trick, current_rank_jump")
        .in("id", athleteIds);

      if (athletesError) throw athletesError;
      if (!fallbackAthletes || fallbackAthletes.length === 0) {
        return new Response(
          JSON.stringify({ error: "No athlete data found" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      athleteInputs = fallbackAthletes.map(a => {
        const rating = disciplineLower === 'slalom' ? a.current_rating_slalom :
                      disciplineLower === 'trick' ? a.current_rating_trick : a.current_rating_jump;
        const rank = disciplineLower === 'slalom' ? a.current_rank_slalom :
                    disciplineLower === 'trick' ? a.current_rank_trick : a.current_rank_jump;
        return {
          athleteId: a.id,
          rating: rating ?? 70,
          rank: rank ?? null,
        };
      });
    } else {
      // USE CACHED ENTRY DATA (discipline_rank, rating_0_100, seed_rank)
      // IMPORTANT: seed_rank is ONLY for ordering among unranked athletes
      // World-ranked athletes ALWAYS take precedence over seed_rank athletes
      
      // First, separate athletes with world rank vs seed rank only
      const entriesWithData = filteredEntries.map((e: any) => {
        const a = e.athletes;
        
        // Prefer entry-cached data, fallback to athlete table
        const entryRating = e.rating_0_100;
        const athleteRating = disciplineLower === 'slalom' ? a.current_rating_slalom :
                              disciplineLower === 'trick' ? a.current_rating_trick : a.current_rating_jump;
        const rating = entryRating ?? athleteRating ?? 70;
        
        // Get world rank (discipline_rank or from athlete table)
        const entryDisciplineRank = e.discipline_rank;
        const athleteRank = disciplineLower === 'slalom' ? a.current_rank_slalom :
                           disciplineLower === 'trick' ? a.current_rank_trick : a.current_rank_jump;
        const worldRank = entryDisciplineRank ?? athleteRank;
        
        return {
          athleteId: e.athlete_id,
          rating: rating,
          worldRank: worldRank, // null if no world rank
          seedRank: e.seed_rank, // used only for unranked athletes
        };
      });
      
      // Sort: world-ranked athletes first (by rank), then unranked (by rating DESC)
      const worldRanked = entriesWithData.filter(e => e.worldRank !== null).sort((a, b) => a.worldRank - b.worldRank);
      const unranked = entriesWithData.filter(e => e.worldRank === null).sort((a, b) => b.rating - a.rating);
      
      // Assign effective ranks: world rank athletes keep their rank, unranked get ranks after the last world rank
      const maxWorldRank = worldRanked.length > 0 ? Math.max(...worldRanked.map(e => e.worldRank!)) : 0;
      
      athleteInputs = [
        ...worldRanked.map(e => ({
          athleteId: e.athleteId,
          rating: e.rating,
          rank: e.worldRank!,
        })),
        ...unranked.map((e, idx) => ({
          athleteId: e.athleteId,
          rating: e.rating,
          rank: maxWorldRank + idx + 1, // Assign ranks after world-ranked athletes
        }))
      ];
      
      // Log rank distribution for debugging
      console.log(`[ODDS] Rank distribution: ${worldRanked.length} world-ranked, ${unranked.length} unranked (assigned ranks ${maxWorldRank + 1}+)`);
      athleteInputs.slice(0, 5).forEach(a => {
        console.log(`[ODDS] Top: id=${a.athleteId.slice(0,8)}, rank=${a.rank}, rating=${a.rating}`);
      });
      const nullRankCount = athleteInputs.filter(a => a.rank === null).length;
      if (nullRankCount > 0) {
        console.warn(`[ODDS] WARNING: ${nullRankCount}/${athleteInputs.length} athletes have null rank after resolution`);
      }
    }

    console.log(`[GENERATE] Market: ${market_id}, Type: ${marketType}, Athletes: ${athleteInputs.length}`);

    const sigma = SIGMA[disciplineLower] ?? 6;
    const houseEdge = HOUSE_EDGE[marketType] ?? 0.10;
    const targetImpliedSum = 1 / (1 + houseEdge);
    const acceptableRange = IMPLIED_SUM_RANGES[marketType] || IMPLIED_SUM_RANGES.WINNER;
    const maxMultiplier = MULTIPLIER_CAPS[marketType] || 15.0;

    // Get existing manual multipliers
    const { data: existingMultipliers } = await supabase
      .from("market_odds")
      .select("athlete_id, manual_multiplier")
      .eq("market_id", market_id);

    const multiplierMap = new Map<string, number>();
    if (existingMultipliers) {
      for (const m of existingMultipliers) {
        multiplierMap.set(m.athlete_id, m.manual_multiplier ?? DEFAULT_MANUAL_MULTIPLIER);
      }
    }

    // Run calibration with probability floors
    const { results: calibratedResults, temperatureUsed, iterations, calibrationPassed, errors } = calibrateOdds(
      athleteInputs, marketType, sigma, houseEdge, multiplierMap
    );

    // CRITICAL: Only apply implied sum enforcement if calibration produced valid constraints
    // Otherwise, enforcing target implied sum can DESTROY the good calibrated odds
    let correctedResults: OddsResult[];
    let scalingFactor = 1.0;
    let finalImpliedSum: number;
    
    if (calibrationPassed) {
      // Calibration passed - use calibrated results directly
      // The calibrated odds already satisfy top-3 constraints
      correctedResults = calibratedResults;
      finalImpliedSum = correctedResults.reduce((sum, r) => sum + (1 / r.finalOdds), 0);
      console.log(`[ENFORCE] Calibration passed - using calibrated odds directly, implied_sum=${finalImpliedSum.toFixed(4)}`);
    } else {
      // Calibration failed - try to enforce target implied sum as fallback
      const enforced = enforceTargetImpliedSum(calibratedResults, targetImpliedSum, maxMultiplier);
      correctedResults = enforced.correctedResults;
      scalingFactor = enforced.scalingFactor;
      finalImpliedSum = enforced.finalImpliedSum;
    }

    // Final validation (pass fieldSize for dynamic constraints)
    const finalValidation = validateConstraints(correctedResults, marketType, athleteInputs.length);
    
    const isWithinRange = finalImpliedSum >= acceptableRange.min && finalImpliedSum <= acceptableRange.max;
    let validationStatus = finalValidation.passed ? 'VALID' : 'INVALID';
    let validationError: string | null = null;

    if (!finalValidation.passed) {
      validationError = `BLOCKED: ${finalValidation.errors.join('; ')}`;
      console.error(`[VALIDATION] ${validationError}`);
    } else if (finalImpliedSum < 0.70 || finalImpliedSum > 1.10) {
      validationStatus = 'INVALID';
      validationError = `BLOCKED: Implied sum ${finalImpliedSum.toFixed(4)} outside safe range 0.70-1.10`;
    } else if (!isWithinRange) {
      validationError = `Warning: Implied sum ${finalImpliedSum.toFixed(4)} outside ideal band ${acceptableRange.min}-${acceptableRange.max}`;
    }

    const actualHouseEdgePct = ((1 / finalImpliedSum - 1) * 100).toFixed(2);

    // Log top 3 by rank
    const sortedByRank = [...correctedResults].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    console.log(`[RESULT] Top 3 by rank:`);
    sortedByRank.slice(0, 3).forEach((r, i) => {
      console.log(`  Rank #${r.rank ?? '?'}: prob=${(r.blendedProbability * 100).toFixed(1)}%, mult=${r.finalOdds.toFixed(2)}x`);
    });

    // Prepare upserts
    const now = new Date().toISOString();
    const marketOddsUpserts = correctedResults.map(result => ({
      market_id,
      athlete_id: result.athleteId,
      power_score: Math.round(result.powerScore * 100) / 100,
      prior_probability: Math.round(result.priorProbability * 100000) / 100000,
      mc_probability: Math.round(result.mcProbability * 100000) / 100000,
      blended_probability: Math.round(result.blendedProbability * 100000) / 100000,
      temperature_used: Math.round(temperatureUsed * 100) / 100,
      calibration_iterations: iterations,
      athlete_rank: result.rank,
      raw_probability: Math.round(result.mcProbability * 100000) / 100000,
      normalized_probability: Math.round(result.normalizedProbability * 100000) / 100000,
      adjusted_probability: Math.round(result.adjustedProbability * 100000) / 100000,
      sims_run: SIMS,
      base_probability: Math.round(result.normalizedProbability * 10000) / 10000,
      base_decimal_odds: Math.round(result.fairOdds * 100) / 100,
      manual_multiplier: result.manualMultiplier,
      final_decimal_odds: result.finalOdds,
      token_price: Math.round(BANKROLL_UNIT / result.normalizedProbability),
      overround: 1 + houseEdge,
      tau: temperatureUsed,
      sims: SIMS,
      target_implied_sum: Math.round(targetImpliedSum * 1000) / 1000,
      scaling_factor: scalingFactor,
      generated_at: now,
      is_frozen: false,
      model_version: 'v4-floors',
    }));

    const { error: upsertError } = await supabase
      .from("market_odds")
      .upsert(marketOddsUpserts, { onConflict: "market_id,athlete_id" });

    if (upsertError) throw upsertError;

    // Update market validation status
    await supabase.from('markets').update({
      odds_validation_status: validationStatus,
      odds_validation_error: validationError
    }).eq('id', market_id);

    // Sync selections table ONLY if validation passed
    // This prevents INVALID markets from showing misleading odds
    if (validationStatus === 'VALID') {
      const selectionsUpserts = correctedResults.map(result => ({
        market_id,
        athlete_id: result.athleteId,
        decimal_odds: result.finalOdds,
        description: `${marketType} - Probability Floors v4`,
      }));

      await supabase
        .from("selections")
        .upsert(selectionsUpserts, { onConflict: "market_id,athlete_id" });
      
      console.log(`[SELECTIONS] Updated ${selectionsUpserts.length} selections with valid odds`);
    } else {
      console.warn(`[SELECTIONS] SKIPPED selection sync - market is ${validationStatus}`);
    }

    // Write audit log
    await writeAuditLog(supabase, {
      actor_type: 'system',
      action_type: 'ODDS_GENERATED_FLOORS',
      entity_type: 'market',
      entity_id: market_id,
      after_state: {
        athletes_processed: correctedResults.length,
        temperature_used: temperatureUsed,
        calibration_iterations: iterations,
        calibration_passed: calibrationPassed,
        validation_passed: finalValidation.passed,
        target_implied_sum: Math.round(targetImpliedSum * 1000) / 1000,
        actual_implied_sum: Math.round(finalImpliedSum * 1000) / 1000,
        house_edge_pct: parseFloat(actualHouseEdgePct),
        scaling_factor: scalingFactor,
        model_version: 'v4-floors',
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        market_id,
        athletes_processed: correctedResults.length,
        temperature_used: temperatureUsed,
        calibration_iterations: iterations,
        calibration_passed: calibrationPassed,
        validation_passed: finalValidation.passed,
        validation_errors: finalValidation.errors,
        target_implied_sum: Math.round(targetImpliedSum * 1000) / 1000,
        actual_implied_sum: Math.round(finalImpliedSum * 1000) / 1000,
        house_edge_pct: actualHouseEdgePct,
        validation_status: validationStatus,
        validation_error: validationError,
        model_version: 'v4-floors',
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const error = err as Error;
    console.error("[GENERATE] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
