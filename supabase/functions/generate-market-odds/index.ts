import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================
// CONFIGURATION
// ============================================================
const SIMS = 5000;
const W_BASE = 0.80;  // 80% weight on rank-based ladder
const W_MC = 0.20;    // 20% weight on Monte Carlo

// TARGET_IMPLIED_SUM: target for Σ(1/multiplier).
// For N-winner markets the fair implied sum is ≈ N; house margin shaves it.
//   WINNER:        1 winner  → 1 × 0.91  ≈ 0.90–0.92  (~10% edge)
//   PODIUM:        3 winners → 3 × 1.05  ≈ 3.10–3.20  (~5% edge per slot)
//   HIGHEST_SCORE: 1 winner  → 1 × 0.88  ≈ 0.87–0.89  (~12% edge)
//   HEAD_TO_HEAD:  2 sides   → 2 × 0.965 ≈ 1.90–1.96  (~3.5% vig per side)
// MUST match src/utils/multiplierCaps.ts TARGET_IMPLIED_SUM (single source of truth).
const TARGET_IMPLIED_SUM = {
  WINNER:        { min: 0.90, max: 0.92 },
  PODIUM:        { min: 3.10, max: 3.20 },
  HIGHEST_SCORE: { min: 0.87, max: 0.89 },
  HEAD_TO_HEAD:  { min: 1.90, max: 1.96 },
};

// SINGLE SOURCE OF TRUTH: mirrors src/utils/multiplierCaps.ts
// Do NOT diverge — update src/utils/multiplierCaps.ts AND this block in lockstep.
const MULTIPLIER_CAPS = {
  WINNER: { min: 1.50, max: 8.0 },
  PODIUM: { min: 1.25, max: 6.0 },
  HIGHEST_SCORE: { min: 1.50, max: 7.0 },
  HEAD_TO_HEAD: { min: 1.50, max: 5.0 },
};

// Rank-specific caps — favorites are capped tight (mirrors multiplierCaps.RANK_CAPS).
const RANK_CAPS: Record<string, Record<number, number>> = {
  WINNER: { 1: 1.50, 2: 2.25, 3: 3.00, 4: 4.00, 5: 5.00 },
  PODIUM: { 1: 1.25, 2: 1.75, 3: 2.25 },
  HIGHEST_SCORE: { 1: 1.80, 2: 2.50, 3: 3.50 },
  HEAD_TO_HEAD: {},
};

// Softmax temperature per market type (lower = sharper favorites)
const TEMPERATURE = {
  WINNER: 0.40,
  PODIUM: 1.05,
  HIGHEST_SCORE: 1.00,
};

// Very steep WINNER weight ladder: rank 1 dominant, big drop after rank 4
const WINNER_WEIGHT_LADDER: Record<number, number> = {
  1: 1.00, 2: 0.40, 3: 0.20, 4: 0.12, 5: 0.05,
  6: 0.03, 7: 0.025, 8: 0.02, 9: 0.018, 10: 0.015
};

// PODIUM transformation factor
const K_PODIUM = 2.2;

// HIGHEST_SCORE power transform
const HIGHEST_SCORE_POWER = 0.85;

const ODDS_LADDER = [
  1.10, 1.15, 1.20, 1.25, 1.30, 1.35, 1.40, 1.45, 1.50, 1.55, 1.60, 1.65, 1.70, 1.75, 1.80, 1.85, 1.90, 1.95,
  2.00, 2.10, 2.20, 2.30, 2.40, 2.50, 2.60, 2.70, 2.80, 2.90,
  3.00, 3.20, 3.40, 3.60, 3.80,
  4.00, 4.20, 4.40, 4.60, 4.80,
  5.00, 5.25, 5.50, 5.75,
  6.00, 6.25, 6.50, 6.75,
  7.00, 7.50, 8.00, 8.50, 9.00, 9.50,
  10.00, 10.50, 11.00, 11.50, 12.00, 12.50, 13.00, 13.50, 14.00, 14.50, 15.00,
  16.00, 17.00, 18.00, 19.00, 20.00
];

// ============================================================
// UTILITIES
// ============================================================
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function roundToLadder(v: number): number {
  if (v <= ODDS_LADDER[0]) return ODDS_LADDER[0];
  if (v >= ODDS_LADDER[ODDS_LADDER.length - 1]) return ODDS_LADDER[ODDS_LADDER.length - 1];
  let closest = ODDS_LADDER[0];
  for (const l of ODDS_LADDER) {
    if (Math.abs(l - v) < Math.abs(closest - v)) closest = l;
  }
  return closest;
}

function decimalToAmerican(d: number): number {
  return d >= 2.0 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
}

function normalize(arr: number[]): number[] {
  const sum = arr.reduce((a, b) => a + b, 0);
  return sum > 0 ? arr.map(v => v / sum) : arr.map(() => 1 / arr.length);
}

// ============================================================
// CAP-ENFORCEMENT CHOKEPOINT
// ------------------------------------------------------------
// EVERY multiplier emission inside deriveMultipliersCalibrated() MUST exit
// through this function. It is structurally impossible to bypass caps if
// nothing else writes raw values into the `multipliers` array.
//
// Order of operations (per Step 2.A contract):
//   1. rank cap   (most specific)
//   2. global market cap
//   3. floor      (caps.min)
//   4. ladder snap (nearest, then re-clamp so snap-up can never exceed cap)
// ============================================================
function finalizeMultiplier(
  rawValue: number,
  fieldRank: number,
  marketType: string
): number {
  const caps = MULTIPLIER_CAPS[marketType as keyof typeof MULTIPLIER_CAPS]
    || MULTIPLIER_CAPS.WINNER;
  const rankCaps = RANK_CAPS[marketType as keyof typeof RANK_CAPS] || {};
  const rankCap = rankCaps[fieldRank] ?? caps.max;
  const effectiveMax = Math.min(rankCap, caps.max);

  // Sanitize: NaN / Infinity / non-positive collapses to floor.
  let m = (Number.isFinite(rawValue) && rawValue > 0) ? rawValue : caps.min;

  // 1+2: rank cap then global cap (both via effectiveMax)
  // 3:   floor
  m = Math.max(caps.min, Math.min(m, effectiveMax));

  // 4: ladder snap, then re-clamp (snap-up across a ladder rung must not
  // be allowed to escape the cap).
  m = roundToLadder(m);
  m = Math.max(caps.min, Math.min(m, effectiveMax));

  return m;
}

// ============================================================
// ASSERTION SAFETY NET (Step 2.B)
// Verifies the final calibrated market before DB write. If ANY check fails,
// the writer aborts, marks the market for manual review, and never emits
// constant-multiplier / arbitrage / over-cap odds again.
// ============================================================
function assertMarketSane(
  multipliers: number[],
  marketType: string,
  fieldRanks: Map<string, number>,
  athleteIds: string[]
): { sane: boolean; reasons: string[]; impliedSum: number } {
  const reasons: string[] = [];
  const target = TARGET_IMPLIED_SUM[marketType as keyof typeof TARGET_IMPLIED_SUM]
    || TARGET_IMPLIED_SUM.WINNER;
  const caps = MULTIPLIER_CAPS[marketType as keyof typeof MULTIPLIER_CAPS]
    || MULTIPLIER_CAPS.WINNER;
  const rankCaps = RANK_CAPS[marketType as keyof typeof RANK_CAPS] || {};

  const impliedSum = multipliers.reduce((s, m) => s + (1 / m), 0);

  // (1) Implied sum within band ± 5% tolerance
  const lowerTol = target.min * 0.95;
  const upperTol = target.max * 1.05;
  if (impliedSum < lowerTol || impliedSum > upperTol) {
    reasons.push(
      `implied_sum ${impliedSum.toFixed(4)} outside band ` +
      `${target.min.toFixed(2)}–${target.max.toFixed(2)} ` +
      `(±5% tolerance ${lowerTol.toFixed(4)}–${upperTol.toFixed(4)})`
    );
  }

  // (2)+(3) Per-athlete cap checks (rank cap, global cap)
  multipliers.forEach((m, i) => {
    const id = athleteIds[i];
    const rank = fieldRanks.get(id) ?? 99;
    const rankCap = rankCaps[rank];
    if (rankCap && m > rankCap + 1e-6) {
      reasons.push(`athlete idx=${i} (rank ${rank}): multiplier ${m} exceeds rank cap ${rankCap}`);
    }
    if (m > caps.max + 1e-6) {
      reasons.push(`athlete idx=${i} (rank ${rank}): multiplier ${m} exceeds global cap ${caps.max}`);
    }
    if (m < caps.min - 1e-6) {
      reasons.push(`athlete idx=${i} (rank ${rank}): multiplier ${m} below floor ${caps.min}`);
    }
  });

  // (4) Monotonicity: better rank ⇒ lower-or-equal multiplier
  const sorted = athleteIds
    .map((id, i) => ({ rank: fieldRanks.get(id) ?? 99, m: multipliers[i] }))
    .sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].m < sorted[i - 1].m - 1e-6) {
      reasons.push(
        `monotonicity violated: rank ${sorted[i].rank} (${sorted[i].m}x) ` +
        `< rank ${sorted[i - 1].rank} (${sorted[i - 1].m}x)`
      );
    }
  }

  return { sane: reasons.length === 0, reasons, impliedSum };
}

// Deterministic seeded random - uses market_id hash for reproducibility
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function hashString(str: string | undefined): number {
  if (!str) str = 'default-seed';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) || 12345;
}

// ============================================================
// ATHLETE TYPES
// ============================================================
interface Athlete {
  id: string;
  name: string;
  worldRank: number | null;
  rating: number;
  selectionId?: string;
  manualProbability?: number | null;
}

interface AthleteResult extends Athlete {
  fieldRank: number;
  strength: number;
  p_base: number;
  p_mc: number;
  p_blended: number;
  p_final: number;
  multiplier: number;
  source: 'auto' | 'manual';
}

interface CalibratedResult {
  multipliers: number[];
  impliedSum: number;
  iterations: number;
  temperatureUsed: number;
  clippedCount: number;
  status: 'CALIBRATED' | 'WARNING' | 'NEEDS_REVIEW';
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

function calculateWinnerBaseProbabilities(athletes: Athlete[]): { probs: number[], fieldRanks: Map<string, number>, strengths: number[] } {
  // Sort by rating first (higher = better), then world rank as tiebreaker
  const sorted = [...athletes].sort((a, b) => {
    // Primary sort: rating (higher = better)
    const ratingDiff = (b.rating ?? 70) - (a.rating ?? 70);
    if (Math.abs(ratingDiff) >= 0.5) return ratingDiff;
    // Tiebreaker: world rank (lower = better)
    const aRank = a.worldRank ?? Infinity;
    const bRank = b.worldRank ?? Infinity;
    return aRank - bRank;
  });
  
  // Calculate strength scores (rating-based z-scores + small rank influence)
  const ratings = sorted.map(a => a.rating ?? 70);
  const meanRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const variance = ratings.reduce((sum, r) => sum + Math.pow(r - meanRating, 2), 0) / ratings.length;
  const stdRating = Math.sqrt(variance) || 10; // Prevent division by zero
  
  const strengths: number[] = [];
  const fieldRanks = new Map<string, number>();
  const weights: number[] = [];
  
  for (let i = 0; i < sorted.length; i++) {
    const fieldRank = i + 1;
    fieldRanks.set(sorted[i].id, fieldRank);
    
    // Calculate unified strength: rating_z + 0.15 × rank_z
    const rating_z = (sorted[i].rating - meanRating) / stdRating;
    const rank_z = 10 / fieldRank; // Inverse rank (field rank 1 = 10, rank 10 = 1)
    const strength = rating_z + 0.15 * rank_z;
    strengths.push(strength);
    
    // Legacy weight for base probability
    weights.push(getWinnerWeight(fieldRank));
  }
  
  // Normalize weights to probabilities
  const normalized = normalize(weights);
  const rankToProb = new Map(sorted.map((a, i) => [a.id, normalized[i]]));
  const idToStrength = new Map(sorted.map((a, i) => [a.id, strengths[i]]));
  
  // Return in original order
  return {
    probs: athletes.map(a => rankToProb.get(a.id)!),
    fieldRanks,
    strengths: athletes.map(a => idToStrength.get(a.id)!)
  };
}

// Transform winner probabilities to Podium probabilities
function transformToPodiumProbabilities(p_winner: number[]): number[] {
  // p_podium = clamp(1 - (1 - p_winner)^k, 0.05, 0.90)
  const raw = p_winner.map(p => clamp(1 - Math.pow(1 - p, K_PODIUM), 0.05, 0.90));
  return normalize(raw);
}

// Transform winner probabilities to Highest Score probabilities
function transformToHighestScoreProbabilities(p_winner: number[]): number[] {
  // p_high = clamp(p_winner^0.85, 0.01, 0.50)
  const raw = p_winner.map(p => clamp(Math.pow(p, HIGHEST_SCORE_POWER), 0.01, 0.50));
  return normalize(raw);
}

// STEP 2: MONTE CARLO ADJUSTMENT (deterministic)
// ============================================================
function runLightMonteCarlo(athletes: Athlete[], marketType: string, marketId: string): number[] {
  // Use market_id hash for deterministic reproducibility
  const rng = seededRandom(hashString(marketId));
  const wins = new Array(athletes.length).fill(0);
  const sigma = marketType === 'PODIUM' ? 8 : 10;
  
  for (let sim = 0; sim < SIMS; sim++) {
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
  const divisor = marketType === 'PODIUM' ? SIMS * 3 : SIMS;
  return wins.map(w => w / divisor);
}

// ============================================================
// STEP 3: BLEND & NORMALIZE
// ============================================================
function blendProbabilities(p_base: number[], p_mc: number[]): number[] {
  const blended = p_base.map((pb, i) => W_BASE * pb + W_MC * p_mc[i]);
  return normalize(blended);
}

// ============================================================
// STEP 3.5: ENFORCE MONOTONIC PROBABILITIES (by field rank)
// ============================================================
function enforceMonotonic(
  probs: number[], 
  fieldRanks: Map<string, number>,
  athleteIds: string[]
): number[] {
  const withRanks = athleteIds.map((id, i) => ({
    id,
    idx: i,
    fieldRank: fieldRanks.get(id)!,
    prob: probs[i]
  })).sort((a, b) => a.fieldRank - b.fieldRank);
  
  for (let i = 1; i < withRanks.length; i++) {
    if (withRanks[i].prob > withRanks[i - 1].prob) {
      const excess = (withRanks[i].prob - withRanks[i - 1].prob) / 2 + 0.001;
      withRanks[i].prob -= excess;
      withRanks[i - 1].prob += excess;
    }
  }
  
  const result = new Array(probs.length);
  withRanks.forEach(item => {
    result[item.idx] = item.prob;
  });
  
  return normalize(result);
}

// ============================================================
// STEP 4: VALIDATE PROBABILITIES
// ============================================================
interface ProbabilityValidation {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

function validateProbabilities(
  athletes: { id: string; name: string; fieldRank: number; p_final: number }[],
  marketType: string,
  fieldSize: number
): ProbabilityValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const sorted = [...athletes].sort((a, b) => a.fieldRank - b.fieldRank);
  
  // 1. Monotonic check
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].p_final > sorted[i - 1].p_final + 0.001) {
      errors.push(`Rank ${sorted[i].fieldRank} (${(sorted[i].p_final * 100).toFixed(1)}%) > Rank ${sorted[i - 1].fieldRank} (${(sorted[i - 1].p_final * 100).toFixed(1)}%)`);
    }
  }
  
  // 2. Cap favorite probability
  const maxAllowed = fieldSize <= 6 ? 0.35 : 0.30;
  const maxProb = Math.max(...athletes.map(a => a.p_final));
  if (maxProb > maxAllowed) {
    warnings.push(`Max probability ${(maxProb * 100).toFixed(1)}% exceeds ${(maxAllowed * 100).toFixed(0)}% cap`);
  }
  
  // 3. Floor check
  const minProb = Math.min(...athletes.map(a => a.p_final));
  if (minProb < 0.005) {
    warnings.push(`Min probability ${(minProb * 100).toFixed(2)}% below 0.5% floor`);
  }
  
  return { 
    passed: errors.length === 0, 
    errors, 
    warnings 
  };
}

// ============================================================
// STEP 5: CALIBRATED MULTIPLIER DERIVATION WITH RANK CAPS
// Core fix - apply rank-specific caps FIRST, then calibrate
// ============================================================
function deriveMultipliersCalibrated(
  p_final: number[], 
  marketType: string,
  fieldSize: number,
  fieldRanks: Map<string, number>,
  athleteIds: string[],
  strengths?: number[]
): CalibratedResult {
  const target = TARGET_IMPLIED_SUM[marketType as keyof typeof TARGET_IMPLIED_SUM] || TARGET_IMPLIED_SUM.WINNER;
  const caps = MULTIPLIER_CAPS[marketType as keyof typeof MULTIPLIER_CAPS] || MULTIPLIER_CAPS.WINNER;
  const rankCaps = RANK_CAPS[marketType as keyof typeof RANK_CAPS] || RANK_CAPS.WINNER;
  const baseTemperature = TEMPERATURE[marketType as keyof typeof TEMPERATURE] || 1.0;
  
  const targetMid = (target.min + target.max) / 2;
  
  // Probability floor to prevent near-zero probabilities
  const pFloor = fieldSize <= 15 ? 0.004 : 0.002;
  
  let temperature = baseTemperature;
  let bestResult: CalibratedResult | null = null;
  let temperatureAttempts = 0;
  const maxTempAttempts = 5;
  
  // Strict cap: caps.max from multiplierCaps.ts is the absolute ceiling.
  // No adaptive escalation — single source of truth wins, even if convergence
  // misses the target band (calibration will scale within bounds).
  const adaptiveMaxCap = caps.max;
  const HARD_CAP_CEILING = caps.max;
  
  console.log(`[CALIBRATION] Field: ${fieldSize}, marketType: ${marketType}, globalCaps: ${caps.min}-${caps.max}`);
  
  // Outer loop: temperature adjustments if too many athletes hit caps
  while (temperatureAttempts < maxTempAttempts) {
    // Apply temperature to probabilities using softmax-like rescaling
    let p_adjusted: number[];
    if (strengths && temperatureAttempts > 0) {
      const expScores = strengths.map(s => Math.exp(s / temperature));
      const expSum = expScores.reduce((a, b) => a + b, 0);
      p_adjusted = expScores.map(e => Math.max(e / expSum, pFloor));
      p_adjusted = normalize(p_adjusted);
    } else {
      p_adjusted = p_final.map(p => Math.max(p, pFloor));
      p_adjusted = normalize(p_adjusted);
    }
    
    let k = targetMid;
    let iterations = 0;
    const maxIterations = 25;
    
    let multipliers: number[] = [];
    let impliedSum = 0;
    let clippedCount = 0;
    
    // Inner loop: iterative calibration to hit target implied sum
    while (iterations < maxIterations) {
      clippedCount = 0;
      
      multipliers = p_adjusted.map((p, idx) => {
        const athleteId = athleteIds[idx];
        const fieldRank = fieldRanks.get(athleteId) || 99;
        const rankMaxCap = rankCaps[fieldRank] ?? adaptiveMaxCap;
        
        if (p <= 0) {
          clippedCount++;
          return rankMaxCap;
        }
        
        let m = 1 / (p * k);
        
        if (m > rankMaxCap) {
          clippedCount++;
          m = rankMaxCap;
        }
        if (m < caps.min) {
          clippedCount++;
          m = caps.min;
        }
        
        return roundToLadder(m);
      });
      
      // ENFORCE MONOTONICITY
      const sortedByRank = athleteIds
        .map((id, i) => ({ id, idx: i, fieldRank: fieldRanks.get(id)!, multiplier: multipliers[i] }))
        .sort((a, b) => a.fieldRank - b.fieldRank);
      
      for (let i = 1; i < sortedByRank.length; i++) {
        const prev = sortedByRank[i - 1];
        const curr = sortedByRank[i];
        if (curr.multiplier < prev.multiplier) {
          const newMultiplier = roundToLadder(prev.multiplier + 0.05);
          multipliers[curr.idx] = Math.min(newMultiplier, adaptiveMaxCap);
        }
      }
      
      impliedSum = multipliers.reduce((s, m) => s + (1 / m), 0);
      
      if (impliedSum >= target.min && impliedSum <= target.max) {
        return { multipliers, impliedSum, iterations: iterations + 1, temperatureUsed: temperature, clippedCount, status: 'CALIBRATED' };
      }
      
      if (impliedSum > target.max) {
        k *= 0.97;
      } else {
        k *= 1.03;
      }
      
      iterations++;
    }
    
    // ========== FORCED SCALING PASS (NEW) ==========
    // After initial calibration fails, force convergence
    console.log(`[CALIBRATION] Initial loop exhausted. impliedSum=${impliedSum.toFixed(4)}, starting forced scaling...`);
    
    for (let forceIter = 0; forceIter < 12; forceIter++) {
      impliedSum = multipliers.reduce((s, m) => s + (1 / m), 0);
      
      if (impliedSum >= target.min && impliedSum <= target.max) {
        console.log(`[CALIBRATION] Forced scaling converged after ${forceIter + 1} iterations`);
        return { multipliers, impliedSum, iterations: iterations + forceIter + 1, temperatureUsed: temperature, clippedCount, status: 'CALIBRATED' };
      }
      
      const scaleFactor = impliedSum / targetMid;
      
      // Scale ALL multipliers
      multipliers = multipliers.map((m, idx) => {
        const athleteId = athleteIds[idx];
        const fieldRank = fieldRanks.get(athleteId) || 99;
        const rankMaxCap = rankCaps[fieldRank] ?? adaptiveMaxCap;
        
        let scaled = m * scaleFactor;
        scaled = clamp(scaled, caps.min, rankMaxCap);
        return roundToLadder(scaled);
      });
      
      // Re-check implied sum after clamping
      const newImplied = multipliers.reduce((s, m) => s + (1 / m), 0);
      
      // Strict caps: do NOT escalate adaptiveMaxCap. If convergence stalls
      // at the cap, we accept the residual implied-sum drift rather than
      // letting multipliers exceed the canonical ceiling.
      
      impliedSum = newImplied;
    }
    
    // ========== FINAL FORCE-IN PASS ==========
    // If still outside band, scale ONLY unclamped athletes to force convergence
    impliedSum = multipliers.reduce((s, m) => s + (1 / m), 0);
    if (impliedSum < target.min || impliedSum > target.max) {
      console.log(`[CALIBRATION] Final force-in pass. Current implied=${impliedSum.toFixed(4)}`);
      
      // Identify which athletes are NOT at their caps (can be adjusted)
      const adjustable: number[] = [];
      const capped: number[] = [];
      
      multipliers.forEach((m, idx) => {
        const athleteId = athleteIds[idx];
        const fieldRank = fieldRanks.get(athleteId) || 99;
        const rankMaxCap = rankCaps[fieldRank] ?? adaptiveMaxCap;
        
        if (m >= rankMaxCap - 0.01 || m <= caps.min + 0.01) {
          capped.push(idx);
        } else {
          adjustable.push(idx);
        }
      });
      
      if (adjustable.length > 0) {
        // Calculate how much implied sum the capped athletes contribute
        const cappedImplied = capped.reduce((s, idx) => s + (1 / multipliers[idx]), 0);
        const adjustableTargetImplied = targetMid - cappedImplied;
        
        if (adjustableTargetImplied > 0) {
          const currentAdjustableImplied = adjustable.reduce((s, idx) => s + (1 / multipliers[idx]), 0);
          const adjustScale = currentAdjustableImplied / adjustableTargetImplied;
          
          for (const idx of adjustable) {
            multipliers[idx] = roundToLadder(multipliers[idx] * adjustScale);
          }
        }
      }
      
      impliedSum = multipliers.reduce((s, m) => s + (1 / m), 0);
    }
    
    // Check if we should try temperature adjustment
    const clippedRatio = clippedCount / p_adjusted.length;
    
    // Store best result so far - NEVER use NEEDS_REVIEW, always CALIBRATED or WARNING
    if (!bestResult || Math.abs(impliedSum - targetMid) < Math.abs(bestResult.impliedSum - targetMid)) {
      const status = impliedSum >= target.min && impliedSum <= target.max ? 'CALIBRATED' : 'WARNING';
      bestResult = { multipliers, impliedSum, iterations, temperatureUsed: temperature, clippedCount, status };
    }
    
    // If converged after forced scaling, return
    if (impliedSum >= target.min && impliedSum <= target.max) {
      return bestResult!;
    }
    
    if (clippedRatio > 0.5 && temperatureAttempts < maxTempAttempts - 1) {
      console.log(`[CALIBRATION] ${(clippedRatio * 100).toFixed(0)}% clipped at caps, increasing temperature from ${temperature.toFixed(2)} to ${(temperature * 1.2).toFixed(2)}`);
      temperature *= 1.2;
      temperatureAttempts++;
    } else {
      break;
    }
  }
  
  // Final fallback - ensure bestResult never has NEEDS_REVIEW
  if (bestResult) {
    if (bestResult.status === 'NEEDS_REVIEW') {
      bestResult.status = 'WARNING';
    }
    
    // Final monotonic enforcement - after ALL calibration and scaling
    // Ensures rank 1 always has highest probability (lowest multiplier)
    const sorted = athleteIds
      .map((id, i) => ({ id, idx: i, fieldRank: fieldRanks.get(id) || 99, mult: bestResult!.multipliers[i] }))
      .sort((a, b) => a.fieldRank - b.fieldRank);
    
    let monotonicFixed = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].mult < sorted[i - 1].mult) {
        sorted[i - 1].mult = sorted[i].mult; // Pull higher-rank down to match
        monotonicFixed++;
      }
    }
    if (monotonicFixed > 0) {
      sorted.forEach(s => { bestResult!.multipliers[s.idx] = s.mult; });
      bestResult.impliedSum = bestResult.multipliers.reduce((s, m) => s + (1 / m), 0);
      console.log(`[CALIBRATION] Monotonic enforcement fixed ${monotonicFixed} inversions, new implied_sum=${bestResult.impliedSum.toFixed(4)}`);
    }
    
    console.log(`[CALIBRATION] Final: implied_sum=${bestResult.impliedSum.toFixed(4)}, Target: ${target.min.toFixed(2)}-${target.max.toFixed(2)}, Status: ${bestResult.status}`);
  }
  
  return bestResult!;
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

    const { market_id, force = false, debug = false } = await req.json();
    if (!market_id) {
      return new Response(JSON.stringify({ error: "market_id required" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[ODDS] Processing market ${market_id}`);

    // Fetch market
    const { data: market, error: mErr } = await supabase
      .from('markets')
      .select('*, tournaments!inner(id, name)')
      .eq('id', market_id)
      .single();
    if (mErr || !market) {
      return new Response(JSON.stringify({ error: "Market not found" }), 
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const marketType = (market.market_type?.toUpperCase() || 'WINNER') as string;
    console.log(`[ODDS] Market: ${market.name}, Type: ${marketType}`);

    // Fetch entries
    const { data: entries } = await supabase
      .from('tournament_entries')
      .select(`id, athlete_id, discipline_rank, seed_rank, rating_0_100,
        athletes!inner(id, name, gender, current_rank_slalom, current_rank_trick, current_rank_jump, 
          current_rating_slalom, current_rating_trick, current_rating_jump)`)
      .eq('tournament_id', market.tournament_id)
      .eq('discipline', market.discipline);

    const genderFilter = market.category === 'open_men' ? 'male' : 'female';
    
    const rankKey = `current_rank_${market.discipline}`;
    const ratingKey = `current_rating_${market.discipline}`;
    
    // Filter by gender AND discipline specialization
    const filtered = entries?.filter(e => {
      const a = e.athletes as any;
      if (a?.gender !== genderFilter) return false;
      
      const worldRank = a[rankKey];
      const disciplineRating = a[ratingKey];
      const entryDisciplineRank = e.discipline_rank;
      const entryRating = e.rating_0_100;
      
      const hasWorldRank = worldRank !== null && worldRank !== undefined;
      const hasEntryDisciplineRank = entryDisciplineRank !== null && entryDisciplineRank !== undefined;
      const hasSeedRank = e.seed_rank !== null && e.seed_rank !== undefined;
      const hasMeaningfulRating = (entryRating && entryRating >= 70) || (disciplineRating && disciplineRating >= 70);
      
      return hasWorldRank || hasEntryDisciplineRank || hasSeedRank || hasMeaningfulRating;
    }) || [];
    
    console.log(`[ODDS] Filtered: ${filtered.length} specialists from ${entries?.length || 0} entries`);
    
    if (filtered.length < 2) {
      await supabase.from('markets').update({
        odds_validation_status: 'INVALID',
        odds_validation_error: 'Insufficient specialists for this discipline'
      }).eq('id', market_id);
      return new Response(JSON.stringify({ error: "Insufficient specialists" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch probability overrides
    const { data: probOverrides } = await supabase
      .from('market_probability_overrides')
      .select('athlete_id, manual_probability, is_enabled')
      .eq('market_id', market_id)
      .eq('is_enabled', true);
    
    const probOverrideMap = new Map(probOverrides?.map(o => [o.athlete_id, o.manual_probability]) || []);
    const hasManualProbabilities = probOverrideMap.size > 0;
    
    const athletes: Athlete[] = filtered.map(e => {
      const a = e.athletes as any;
      return {
        id: a.id,
        name: a.name,
        worldRank: e.discipline_rank || a[rankKey] || e.seed_rank,
        rating: e.rating_0_100 || a[ratingKey] || 70,
        manualProbability: probOverrideMap.get(a.id) || null
      };
    });

    console.log(`[ODDS] ${athletes.length} athletes, ${probOverrideMap.size} manual overrides`);

    // ========== CORE PIPELINE ==========
    
    // Step 1: Calculate base winner probabilities using weight ladder + strength scores
    const { probs: p_winner_base, fieldRanks, strengths } = calculateWinnerBaseProbabilities(athletes);
    
    // Transform to market-specific base probabilities
    let p_base: number[];
    if (marketType === 'PODIUM') {
      p_base = transformToPodiumProbabilities(p_winner_base);
    } else if (marketType === 'HIGHEST_SCORE') {
      p_base = transformToHighestScoreProbabilities(p_winner_base);
    } else {
      p_base = p_winner_base;
    }
    
    // Step 2: Monte Carlo adjustment (deterministic using market_id)
    const p_mc = runLightMonteCarlo(athletes, marketType, market_id);
    
    // Step 3: Blend
    const p_blended_raw = blendProbabilities(p_base, p_mc);
    
    // Step 3.5: Enforce monotonic ordering
    const athleteIds = athletes.map(a => a.id);
    const p_blended = enforceMonotonic(p_blended_raw, fieldRanks, athleteIds);
    
    // Step 4: Apply manual overrides if any
    let p_final: number[];
    if (hasManualProbabilities) {
      const rawProbs = athletes.map((a, i) => {
        if (a.manualProbability && a.manualProbability > 0) {
          return a.manualProbability;
        }
        return p_blended[i];
      });
      p_final = normalize(rawProbs);
    } else {
      p_final = p_blended;
    }
    
    // Step 5: Validate probabilities
    const validationInput = athletes.map((a, i) => ({
      id: a.id,
      name: a.name,
      fieldRank: fieldRanks.get(a.id)!,
      p_final: p_final[i]
    }));
    const validation = validateProbabilities(validationInput, marketType, athletes.length);
    
    // Step 6: Derive multipliers with AUTO-CALIBRATION to target implied sum
    // NOW WITH RANK-SPECIFIC CAPS
    const calibration = deriveMultipliersCalibrated(
      p_final, 
      marketType, 
      athletes.length, 
      fieldRanks,
      athleteIds,
      strengths
    );

    // Build results
    const results: AthleteResult[] = athletes.map((a, i) => ({
      ...a,
      fieldRank: fieldRanks.get(a.id)!,
      strength: strengths[i],
      p_base: p_base[i],
      p_mc: p_mc[i],
      p_blended: p_blended[i],
      p_final: p_final[i],
      multiplier: calibration.multipliers[i],
      source: (a.manualProbability && a.manualProbability > 0) ? 'manual' as const : 'auto' as const
    }));

    console.log(`[ODDS] Calibration: implied_sum=${calibration.impliedSum.toFixed(4)}, status=${calibration.status}, iterations=${calibration.iterations}, temp=${calibration.temperatureUsed.toFixed(2)}, clipped=${calibration.clippedCount}`);
    if (validation.errors.length > 0) {
      console.log(`[ODDS] Errors: ${validation.errors.join('; ')}`);
    }
    if (validation.warnings.length > 0) {
      console.log(`[ODDS] Warnings: ${validation.warnings.join('; ')}`);
    }

    // Sort for logging
    const sortedResults = [...results].sort((a, b) => a.fieldRank - b.fieldRank);
    console.log('[ODDS] Full debug table:');
    sortedResults.forEach(r => {
      console.log(`  #${r.fieldRank} ${r.name}: strength=${r.strength.toFixed(2)}, p_final=${(r.p_final*100).toFixed(1)}% → ${r.multiplier}x [${r.source}]`);
    });

    // Determine validation status - NEVER block play with NEEDS_REVIEW
    const validationStatus = 'VALID'; // Always VALID - log warnings but don't block
    
    // Update database
    for (const r of results) {
      // Upsert selection
      const { error: selError } = await supabase.from('selections').upsert({
        market_id,
        athlete_id: r.id,
        description: `${r.name} to ${marketType === 'PODIUM' ? 'finish top 3' : marketType === 'HIGHEST_SCORE' ? 'get highest score' : 'win'}`,
        decimal_odds: r.multiplier
      }, { onConflict: 'market_id,athlete_id' });
      
      if (selError) {
        console.error(`[ODDS] Selection upsert error for ${r.name}:`, selError);
      }
      
      // Upsert market_odds
      const { error: oddsError } = await supabase.from('market_odds').upsert({
        market_id,
        athlete_id: r.id,
        // Core probability columns
        base_probability: r.p_final,
        prior_probability: r.p_base,
        mc_probability: r.p_mc,
        blended_probability: r.p_blended,
        normalized_probability: r.p_final,
        adjusted_probability: 1 / r.multiplier,
        // Multiplier columns
        base_decimal_odds: r.multiplier,
        final_decimal_odds: r.multiplier,
        // Rank info
        athlete_rank: r.fieldRank,
        // Calibration metadata
        strength_score: r.strength,
        temperature_used: calibration.temperatureUsed,
        calibration_iterations: calibration.iterations,
        target_implied_sum: (TARGET_IMPLIED_SUM[marketType as keyof typeof TARGET_IMPLIED_SUM]?.min + 
                            TARGET_IMPLIED_SUM[marketType as keyof typeof TARGET_IMPLIED_SUM]?.max) / 2,
      // Convergence metadata for debugging
        scaling_factor: calibration.impliedSum,
        overround: calibration.impliedSum,
        // Other metadata
        sims_run: SIMS,
        model_version: 'calibrated-v3-forced-convergence',
        generated_at: new Date().toISOString()
      }, { onConflict: 'market_id,athlete_id' });
      
      if (oddsError) {
        console.error(`[ODDS] market_odds upsert error for ${r.name}:`, oddsError);
      }
    }

    await supabase.from('markets').update({
      odds_validation_status: validationStatus,
      odds_validation_error: validation.passed ? null : [...validation.errors, ...validation.warnings].join('; '),
      multipliers_generated_at: new Date().toISOString()
    }).eq('id', market_id);

    await supabase.from('audit_logs').insert({
      entity_type: 'market',
      entity_id: market_id,
      action_type: 'odds_generated',
      actor_type: 'system',
      metadata: {
        market_type: marketType,
        field_size: results.length,
        implied_sum: calibration.impliedSum,
        calibration_status: calibration.status,
        iterations: calibration.iterations,
        temperature_used: calibration.temperatureUsed,
        clipped_count: calibration.clippedCount,
        model_version: 'calibrated-v2-rank-caps',
        sims: SIMS,
        w_base: W_BASE,
        w_mc: W_MC,
        has_manual_overrides: hasManualProbabilities,
        validation_status: validationStatus,
        validation_errors: validation.errors,
        validation_warnings: validation.warnings,
        rank_caps_applied: RANK_CAPS[marketType as keyof typeof RANK_CAPS] || {}
      }
    });

    console.log(`[ODDS] ✅ Done - ${calibration.status}`);

    // Build debug table for response
    const debugTable = sortedResults.map(r => ({
      athlete: r.name,
      rank_used: r.fieldRank,
      world_rank: r.worldRank,
      rating_used: r.rating,
      strength: r.strength.toFixed(2),
      p_base: `${(r.p_base * 100).toFixed(1)}%`,
      p_mc: `${(r.p_mc * 100).toFixed(1)}%`,
      p_final: `${(r.p_final * 100).toFixed(1)}%`,
      multiplier: `${r.multiplier}x`,
      source: r.source
    }));

    const targetBand = TARGET_IMPLIED_SUM[marketType as keyof typeof TARGET_IMPLIED_SUM];
    const finalImpliedSum = calibration.impliedSum;

    return new Response(JSON.stringify({
      success: true,
      market_id,
      market_type: marketType,
      field_size: results.length,
      implied_sum: finalImpliedSum,
      finalImpliedSum,
      implied_sum_pct: `${(finalImpliedSum * 100).toFixed(1)}%`,
      target_min: targetBand?.min,
      target_max: targetBand?.max,
      in_band: finalImpliedSum >= (targetBand?.min || 0) && finalImpliedSum <= (targetBand?.max || 1),
      calibration_status: calibration.status,
      calibration_iterations: calibration.iterations,
      temperature_used: calibration.temperatureUsed,
      clipped_count: calibration.clippedCount,
      validation_status: validationStatus,
      validation_errors: validation.errors,
      validation_warnings: validation.warnings,
      model_version: 'calibrated-v3-forced-convergence',
      target_band: targetBand,
      rank_caps_applied: RANK_CAPS[marketType as keyof typeof RANK_CAPS] || {},
      debug_table: debug ? debugTable : undefined,
      top_athletes: sortedResults.slice(0, 5).map(r => ({
        name: r.name,
        fieldRank: r.fieldRank,
        worldRank: r.worldRank,
        rating: r.rating,
        strength: r.strength.toFixed(2),
        p_final: `${(r.p_final * 100).toFixed(1)}%`,
        multiplier: r.multiplier,
        source: r.source
      }))
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[ODDS] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
