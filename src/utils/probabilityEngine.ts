/**
 * PROBABILITY ENGINE - Core probability calculations for prediction markets
 * 
 * This is the ONLY source of truth for probability calculations.
 * All multipliers are derived from probabilities at the end of the pipeline.
 * 
 * Pipeline: Rank → Base Probability → MC Adjustment → Blend → Normalize → Validate
 * Then: Probability → Multiplier (derived, never stored as source of truth)
 */

// ============================================================
// CONFIGURATION
// ============================================================
export const PROBABILITY_CONFIG = {
  // Blend weights
  W_BASE: 0.80,  // 80% weight on rank-based ladder
  W_MC: 0.20,    // 20% weight on Monte Carlo
  
  // Simulations
  SIMS: 5000,
  
  // Transformation factors
  K_PODIUM: 2.2,
  HIGHEST_SCORE_POWER: 0.85,
  
  // Probability caps
  FAVORITE_CAP_SMALL_FIELD: 0.35,  // Max prob when field <= 6
  FAVORITE_CAP_LARGE_FIELD: 0.30,  // Max prob when field > 6
  MIN_PROBABILITY: 0.005,          // 0.5% floor
};

// Weight ladder for WINNER probability (rank-driven)
export const WINNER_WEIGHT_LADDER: Record<number, number> = {
  1: 1.00, 2: 0.75, 3: 0.60, 4: 0.45, 5: 0.38,
  6: 0.32, 7: 0.27, 8: 0.23, 9: 0.20, 10: 0.18
};

// ============================================================
// TYPES
// ============================================================
export interface AthleteInput {
  id: string;
  name: string;
  worldRank: number | null;
  disciplineRank?: number | null;
  rating: number;
  manualProbability?: number | null;
}

export interface ProbabilityResult {
  id: string;
  name: string;
  fieldRank: number;
  p_base: number;
  p_mc: number;
  p_blended: number;
  p_final: number;
  source: 'auto' | 'manual';
}

export interface ProbabilityValidation {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================
// CORE UTILITIES
// ============================================================
export function normalize(arr: number[]): number[] {
  const sum = arr.reduce((a, b) => a + b, 0);
  return sum > 0 ? arr.map(v => v / sum) : arr.map(() => 1 / arr.length);
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function stddev(arr: number[]): number {
  const n = arr.length;
  if (n === 0) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const squaredDiffs = arr.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / n);
}

// ============================================================
// STEP 1: BASE PROBABILITY using weight ladder
// ============================================================
function getWinnerWeight(fieldRank: number): number {
  if (fieldRank <= 10) {
    return WINNER_WEIGHT_LADDER[fieldRank];
  }
  // Rank 11+: decay formula
  return Math.max(WINNER_WEIGHT_LADDER[10] * (10 / fieldRank), 0.04);
}

export function calculateWinnerBaseProbabilities(
  athletes: AthleteInput[]
): { probs: number[]; fieldRanks: Map<string, number> } {
  // Sort by discipline rank, then world rank, then rating
  const sorted = [...athletes].sort((a, b) => {
    const aRank = a.disciplineRank ?? a.worldRank ?? Infinity;
    const bRank = b.disciplineRank ?? b.worldRank ?? Infinity;
    if (aRank !== bRank) return aRank - bRank;
    return (b.rating ?? 0) - (a.rating ?? 0);
  });
  
  // Assign field ranks and get weights
  const weights: number[] = [];
  const fieldRanks = new Map<string, number>();
  
  for (let i = 0; i < sorted.length; i++) {
    const fieldRank = i + 1;
    fieldRanks.set(sorted[i].id, fieldRank);
    weights.push(getWinnerWeight(fieldRank));
  }
  
  // Normalize weights to probabilities
  const normalized = normalize(weights);
  const rankToProb = new Map(sorted.map((a, i) => [a.id, normalized[i]]));
  
  // Return in original order
  return {
    probs: athletes.map(a => rankToProb.get(a.id)!),
    fieldRanks
  };
}

// ============================================================
// STEP 2: TRANSFORM TO MARKET-SPECIFIC PROBABILITIES
// ============================================================
export function transformToPodiumProbabilities(p_winner: number[]): number[] {
  // p_podium = clamp(1 - (1 - p_winner)^k, 0.05, 0.90)
  const raw = p_winner.map(p => 
    clamp(1 - Math.pow(1 - p, PROBABILITY_CONFIG.K_PODIUM), 0.05, 0.90)
  );
  return normalize(raw);
}

export function transformToHighestScoreProbabilities(p_winner: number[]): number[] {
  // p_high = clamp(p_winner^0.85, 0.01, 0.50)
  const raw = p_winner.map(p => 
    clamp(Math.pow(p, PROBABILITY_CONFIG.HIGHEST_SCORE_POWER), 0.01, 0.50)
  );
  return normalize(raw);
}

// ============================================================
// STEP 3: MONTE CARLO ADJUSTMENT
// ============================================================
export function runLightMonteCarlo(
  athletes: AthleteInput[], 
  marketType: 'WINNER' | 'PODIUM' | 'HIGHEST_SCORE'
): number[] {
  const rng = seededRandom(Date.now());
  const wins = new Array(athletes.length).fill(0);
  const sigma = marketType === 'PODIUM' ? 8 : 10;
  const sims = PROBABILITY_CONFIG.SIMS;
  
  for (let sim = 0; sim < sims; sim++) {
    // Simulate performance: rating + noise
    const performances = athletes.map(a => (a.rating ?? 70) + (rng() - 0.5) * sigma * 2);
    
    if (marketType === 'PODIUM') {
      // Top 3 all "win"
      const indices = performances
        .map((p, i) => ({ p, i }))
        .sort((a, b) => b.p - a.p)
        .slice(0, 3)
        .map(x => x.i);
      indices.forEach(i => wins[i]++);
    } else {
      // Winner only
      let bestIdx = 0;
      for (let i = 1; i < performances.length; i++) {
        if (performances[i] > performances[bestIdx]) bestIdx = i;
      }
      wins[bestIdx]++;
    }
  }
  
  // Normalize: for PODIUM, each sim has 3 winners
  const divisor = marketType === 'PODIUM' ? sims * 3 : sims;
  return wins.map(w => w / divisor);
}

// ============================================================
// STEP 4: BLEND & ENFORCE MONOTONIC
// ============================================================
export function blendProbabilities(p_base: number[], p_mc: number[]): number[] {
  const blended = p_base.map((pb, i) => 
    PROBABILITY_CONFIG.W_BASE * pb + PROBABILITY_CONFIG.W_MC * p_mc[i]
  );
  return normalize(blended);
}

export function enforceMonotonic(
  probs: number[], 
  fieldRanks: Map<string, number>,
  athleteIds: string[]
): number[] {
  // Create array of { id, fieldRank, prob } and sort by field rank
  const withRanks = athleteIds.map((id, i) => ({
    id,
    idx: i,
    fieldRank: fieldRanks.get(id)!,
    prob: probs[i]
  })).sort((a, b) => a.fieldRank - b.fieldRank);
  
  // Enforce: prob[i] >= prob[i+1] for all i (descending by rank)
  for (let i = 1; i < withRanks.length; i++) {
    if (withRanks[i].prob > withRanks[i - 1].prob) {
      // Transfer excess probability from lower-ranked to higher-ranked
      const excess = (withRanks[i].prob - withRanks[i - 1].prob) / 2 + 0.001;
      withRanks[i].prob -= excess;
      withRanks[i - 1].prob += excess;
    }
  }
  
  // Rebuild in original order and normalize
  const result = new Array(probs.length);
  withRanks.forEach(item => {
    result[item.idx] = item.prob;
  });
  
  return normalize(result);
}

// ============================================================
// STEP 5: APPLY MANUAL OVERRIDES
// ============================================================
export function applyManualOverrides(
  athletes: AthleteInput[],
  autoProbs: number[]
): { probs: number[]; sources: ('auto' | 'manual')[] } {
  const sources: ('auto' | 'manual')[] = [];
  
  const rawProbs = athletes.map((a, i) => {
    if (a.manualProbability && a.manualProbability > 0) {
      sources.push('manual');
      return a.manualProbability;
    }
    sources.push('auto');
    return autoProbs[i];
  });
  
  return { probs: normalize(rawProbs), sources };
}

// ============================================================
// STEP 6: VALIDATION
// ============================================================
export function validateProbabilities(
  athletes: { id: string; name: string; fieldRank: number; p_final: number }[],
  marketType: 'WINNER' | 'PODIUM' | 'HIGHEST_SCORE',
  fieldSize: number
): ProbabilityValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Sort by field rank
  const sorted = [...athletes].sort((a, b) => a.fieldRank - b.fieldRank);
  
  // 1. Monotonic check: better rank should have >= probability
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].p_final > sorted[i - 1].p_final + 0.001) {
      errors.push(`MARKET_INVALID_RANK_ORDER: Rank ${sorted[i].fieldRank} (${(sorted[i].p_final * 100).toFixed(1)}%) > Rank ${sorted[i - 1].fieldRank} (${(sorted[i - 1].p_final * 100).toFixed(1)}%)`);
    }
  }
  
  // 2. Cap favorite probability
  const maxAllowed = fieldSize <= 6 
    ? PROBABILITY_CONFIG.FAVORITE_CAP_SMALL_FIELD 
    : PROBABILITY_CONFIG.FAVORITE_CAP_LARGE_FIELD;
  const maxProb = Math.max(...athletes.map(a => a.p_final));
  if (maxProb > maxAllowed) {
    warnings.push(`Max probability ${(maxProb * 100).toFixed(1)}% exceeds ${(maxAllowed * 100).toFixed(0)}% cap`);
  }
  
  // 3. Floor check
  const minProb = Math.min(...athletes.map(a => a.p_final));
  if (minProb < PROBABILITY_CONFIG.MIN_PROBABILITY) {
    warnings.push(`Min probability ${(minProb * 100).toFixed(2)}% below ${(PROBABILITY_CONFIG.MIN_PROBABILITY * 100).toFixed(1)}% floor`);
  }
  
  // 4. Uniform/flat check - prevent markets with no differentiation
  const probValues = athletes.map(a => a.p_final);
  if (stddev(probValues) < 0.01) {
    errors.push('MARKET_INVALID_FLAT_PROBABILITIES: Insufficient probability variance');
  }
  
  return { 
    passed: errors.length === 0, 
    errors, 
    warnings 
  };
}

// ============================================================
// COMPLETE PIPELINE
// ============================================================
export type MarketType = 'WINNER' | 'PODIUM' | 'HIGHEST_SCORE';

export function calculateMarketProbabilities(
  athletes: AthleteInput[],
  marketType: MarketType
): { results: ProbabilityResult[]; fieldRanks: Map<string, number>; validation: ProbabilityValidation } {
  // Step 1: Calculate base winner probabilities using weight ladder
  const { probs: p_winner_base, fieldRanks } = calculateWinnerBaseProbabilities(athletes);
  
  // Step 2: Transform to market-specific base probabilities
  let p_base: number[];
  if (marketType === 'PODIUM') {
    p_base = transformToPodiumProbabilities(p_winner_base);
  } else if (marketType === 'HIGHEST_SCORE') {
    p_base = transformToHighestScoreProbabilities(p_winner_base);
  } else {
    p_base = p_winner_base;
  }
  
  // Step 3: Monte Carlo adjustment
  const p_mc = runLightMonteCarlo(athletes, marketType);
  
  // Step 4: Blend
  const p_blended_raw = blendProbabilities(p_base, p_mc);
  
  // Step 4.5: Enforce monotonic ordering
  const athleteIds = athletes.map(a => a.id);
  const p_blended = enforceMonotonic(p_blended_raw, fieldRanks, athleteIds);
  
  // Step 5: Apply manual overrides
  const { probs: p_final, sources } = applyManualOverrides(athletes, p_blended);
  
  // Step 6: Validate
  const validationInput = athletes.map((a, i) => ({
    id: a.id,
    name: a.name,
    fieldRank: fieldRanks.get(a.id)!,
    p_final: p_final[i]
  }));
  const validation = validateProbabilities(validationInput, marketType, athletes.length);
  
  // Build results
  const results: ProbabilityResult[] = athletes.map((a, i) => ({
    id: a.id,
    name: a.name,
    fieldRank: fieldRanks.get(a.id)!,
    p_base: p_base[i],
    p_mc: p_mc[i],
    p_blended: p_blended[i],
    p_final: p_final[i],
    source: sources[i]
  }));
  
  return { results, fieldRanks, validation };
}
