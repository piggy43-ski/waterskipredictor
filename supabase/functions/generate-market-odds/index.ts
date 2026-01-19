import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Audit log helper
interface AuditLogEntry {
  actor_type: 'admin' | 'system';
  actor_id?: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  before_state?: any;
  after_state?: any;
  metadata?: Record<string, any>;
}

async function writeAuditLog(supabase: any, entry: AuditLogEntry): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      actor_type: entry.actor_type,
      actor_id: entry.actor_id || null,
      action_type: entry.action_type,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      before_state: entry.before_state || null,
      after_state: entry.after_state || null,
      metadata: entry.metadata || {},
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

// ============ CALIBRATION CONFIG ============
// Initial temperatures by market type (lower = sharper favorites)
const INITIAL_TEMPERATURE: Record<string, number> = {
  WINNER: 12,
  HIGHEST_SCORE: 12,
  PODIUM: 10
};

// Prior/MC blending factor (0.65 = 65% MC, 35% prior)
const PRIOR_BLEND_ALPHA = 0.65;

// Temperature reduction per calibration iteration (10%)
const TEMP_REDUCTION_FACTOR = 0.90;

// Maximum calibration iterations
const MAX_CALIBRATION_ITERATIONS = 10;

// Top-3 multiplier constraints by market type
const TOP3_CONSTRAINTS: Record<string, { top1Max: number; top2Max: number; top3Max: number }> = {
  WINNER: { top1Max: 4.0, top2Max: 6.0, top3Max: 8.0 },
  HIGHEST_SCORE: { top1Max: 4.5, top2Max: 6.5, top3Max: 9.0 },
  PODIUM: { top1Max: 2.2, top2Max: 2.8, top3Max: 3.5 }
};

// Hard multiplier caps (backstop for longshots)
const MULTIPLIER_CAPS: Record<string, number> = {
  WINNER: 15.0,
  HIGHEST_SCORE: 12.0,
  PODIUM: 8.0
};

// ============ OTHER CONSTANTS ============
const SIGMA: Record<string, number> = { slalom: 6, trick: 10, jump: 8 };
const SIMS = 20000;
const BANKROLL_UNIT = 100000;
const ODDS_MIN = 1.20;
const ODDS_MAX = 25.0;
const DEFAULT_MANUAL_MULTIPLIER = 0.97;

// House edge by market type
const HOUSE_EDGE: Record<string, number> = {
  WINNER: 0.10,
  PODIUM: 0.18,
  HIGHEST_SCORE: 0.14
};

// Acceptable ranges for implied sum validation
const IMPLIED_SUM_RANGES: Record<string, { min: number; max: number }> = {
  WINNER: { min: 0.90, max: 0.915 },
  PODIUM: { min: 0.84, max: 0.86 },
  HIGHEST_SCORE: { min: 0.87, max: 0.89 }
};

// Expected raw probability sums by market type
const EXPECTED_RAW_SUM: Record<string, { min: number; max: number }> = {
  WINNER: { min: 0.98, max: 1.02 },
  HIGHEST_SCORE: { min: 0.98, max: 1.02 },
  PODIUM: { min: 2.95, max: 3.05 }
};

// Odds ladder for rounding
const ODDS_LADDER = [
  1.20, 1.25, 1.30, 1.35, 1.40, 1.45, 1.50, 1.55, 1.60, 1.65, 1.70, 1.75, 1.80, 1.85, 1.90, 1.95,
  2.00, 2.10, 2.20, 2.30, 2.40, 2.50, 2.60, 2.70, 2.80, 2.90,
  3.00, 3.20, 3.40, 3.60, 3.80,
  4.00, 4.50, 5.00, 5.50, 6.00, 6.50, 7.00, 7.50, 8.00, 8.50, 9.00, 9.50, 10.00,
  11.00, 12.00, 13.00, 14.00, 15.00, 16.00, 17.00, 18.00, 19.00, 20.00, 21.00, 22.00, 23.00, 24.00, 25.00
];

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

// Box-Muller transform for normal distribution
function normalRandom(mu: number, sigma: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mu + sigma * z;
}

// Weighted random selection without replacement
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

// ============ INTERFACES ============
interface AthleteOddsInput {
  athleteId: string;
  rating: number;
  rank: number | null;  // NEW: World rank for power score
}

interface RawProbabilityResult {
  athleteId: string;
  rawProbability: number;
  winCount: number;
}

interface OddsResult {
  athleteId: string;
  powerScore: number;           // NEW: rating + rank bonus
  priorProbability: number;     // NEW: from rank/rating prior
  mcProbability: number;        // NEW: from Monte Carlo
  blendedProbability: number;   // NEW: alpha*MC + (1-alpha)*prior
  normalizedProbability: number;
  fairOdds: number;
  adjustedProbability: number;
  finalOdds: number;
  manualMultiplier: number;
  rank: number | null;          // NEW: athlete's world rank
}

// ============ POWER SCORE CALCULATION ============
/**
 * Calculate power score from rating and rank
 * Rating is primary (0-100), rank provides bonus for top athletes
 */
function calculatePowerScore(rating: number, rank: number | null): number {
  let score = rating;
  
  // Rank bonus for top athletes
  if (rank !== null && rank > 0) {
    if (rank === 1) score += 10;
    else if (rank === 2) score += 8;
    else if (rank === 3) score += 6;
    else if (rank <= 5) score += 4;
    else if (rank <= 10) score += 2;
    else if (rank <= 20) score += 1;
  }
  
  return Math.max(50, Math.min(110, score));  // Allow slightly above 100 for top-ranked
}

// ============ PRIOR PROBABILITY CALCULATION ============
/**
 * Calculate prior probabilities from power scores using softmax
 */
function calculatePriorProbabilities(
  athletes: { athleteId: string; powerScore: number }[],
  temperature: number
): Map<string, number> {
  const skills = athletes.map(a => Math.exp(a.powerScore / temperature));
  const totalSkill = skills.reduce((a, b) => a + b, 0);
  
  const priorMap = new Map<string, number>();
  athletes.forEach((a, i) => {
    priorMap.set(a.athleteId, skills[i] / totalSkill);
  });
  
  return priorMap;
}

// ============ MONTE CARLO SIMULATIONS ============
/**
 * WINNER: Softmax produces probabilities that naturally sum to 1.0
 */
function calculateWinnerProbabilities(athletes: AthleteOddsInput[], temperature: number): RawProbabilityResult[] {
  const strengths = athletes.map(a => {
    const powerScore = calculatePowerScore(a.rating, a.rank);
    return Math.exp(powerScore / temperature);
  });
  const totalStrength = strengths.reduce((a, b) => a + b, 0);
  
  return athletes.map((athlete, i) => ({
    athleteId: athlete.athleteId,
    rawProbability: strengths[i] / totalStrength,
    winCount: Math.round((strengths[i] / totalStrength) * SIMS),
  }));
}

/**
 * PODIUM: Monte Carlo simulation for top-3 finish
 */
function calculatePodiumProbabilities(athletes: AthleteOddsInput[], temperature: number, sims: number): RawProbabilityResult[] {
  const weights = athletes.map(a => {
    const powerScore = calculatePowerScore(a.rating, a.rank);
    return Math.exp(powerScore / temperature);
  });
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

  return athletes.map(athlete => {
    const count = top3Counts.get(athlete.athleteId) || 0;
    return {
      athleteId: athlete.athleteId,
      rawProbability: count / sims,
      winCount: count,
    };
  });
}

/**
 * HIGHEST_SCORE: Monte Carlo with normal distribution
 */
function calculateHighestScoreProbabilities(athletes: AthleteOddsInput[], sigma: number, sims: number): RawProbabilityResult[] {
  const winCounts = new Map<string, number>();
  
  for (const athlete of athletes) {
    winCounts.set(athlete.athleteId, 0);
  }

  for (let sim = 0; sim < sims; sim++) {
    let maxScore = -Infinity;
    let winnerId = "";
    
    for (const athlete of athletes) {
      const powerScore = calculatePowerScore(athlete.rating, athlete.rank);
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

  return athletes.map(athlete => {
    const count = winCounts.get(athlete.athleteId) || 0;
    return {
      athleteId: athlete.athleteId,
      rawProbability: count / sims,
      winCount: count,
    };
  });
}

// ============ PROBABILITY BLENDING ============
/**
 * Blend prior and Monte Carlo probabilities
 * alpha = 0.65 means 65% MC, 35% prior
 */
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
  
  // Normalize to sum to 1.0
  const total = Array.from(blended.values()).reduce((a, b) => a + b, 0);
  for (const [athleteId, prob] of blended) {
    blended.set(athleteId, prob / total);
  }
  
  return blended;
}

// ============ ODDS DERIVATION ============
function deriveOddsFromBlendedProbabilities(
  athletes: AthleteOddsInput[],
  priorProbs: Map<string, number>,
  mcProbs: Map<string, number>,
  blendedProbs: Map<string, number>,
  houseEdge: number,
  multiplierMap: Map<string, number>
): OddsResult[] {
  return athletes.map(athlete => {
    const powerScore = calculatePowerScore(athlete.rating, athlete.rank);
    const priorProb = priorProbs.get(athlete.athleteId) || 0.01;
    const mcProb = mcProbs.get(athlete.athleteId) || 0.01;
    const blendedProb = blendedProbs.get(athlete.athleteId) || 0.01;
    
    // Safety clamp
    const safeBlendedProb = Math.max(blendedProb, 0.001);
    
    // Fair odds
    const fairOdds = Math.min(1 / safeBlendedProb, ODDS_MAX);
    
    // Adjusted probability with house edge
    const adjustedProbability = safeBlendedProb * (1 + houseEdge);
    const rawFinalOdds = 1 / adjustedProbability;
    
    // Apply manual multiplier
    const manualMultiplier = multiplierMap.get(athlete.athleteId) ?? DEFAULT_MANUAL_MULTIPLIER;
    const adjustedOdds = rawFinalOdds * manualMultiplier;
    
    // Round to ladder and clamp
    const finalOdds = clampOdds(roundToLadder(adjustedOdds));
    
    return {
      athleteId: athlete.athleteId,
      powerScore,
      priorProbability: priorProb,
      mcProbability: mcProb,
      blendedProbability: blendedProb,
      normalizedProbability: safeBlendedProb,
      fairOdds,
      adjustedProbability,
      finalOdds,
      manualMultiplier,
      rank: athlete.rank,
    };
  });
}

// ============ HARD MULTIPLIER CAPS ============
/**
 * Apply hard caps to longshot multipliers, compressing tail without changing top-3 order
 */
function applyHardMultiplierCaps(results: OddsResult[], marketType: string): OddsResult[] {
  const maxMultiplier = MULTIPLIER_CAPS[marketType] || 15.0;
  
  return results.map(r => {
    if (r.finalOdds > maxMultiplier) {
      console.log(`[CAP] Athlete ${r.athleteId} capped: ${r.finalOdds.toFixed(2)}x → ${maxMultiplier}x`);
      return {
        ...r,
        finalOdds: maxMultiplier,
        adjustedProbability: 1 / maxMultiplier
      };
    }
    return r;
  });
}

// ============ ENFORCE TARGET IMPLIED SUM ============
function enforceTargetImpliedSum(
  results: OddsResult[],
  targetImpliedSum: number,
  maxMultiplier: number
): { correctedResults: OddsResult[]; scalingFactor: number; finalImpliedSum: number } {
  let workingResults = [...results];
  let totalScalingFactor = 1.0;
  const MAX_ITERATIONS = 5;
  const TOLERANCE = 0.02;
  
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const currentImpliedSum = workingResults.reduce((sum, r) => sum + (1 / r.finalOdds), 0);
    
    console.log(`[ENFORCE] Iteration ${iter + 1}: implied_sum=${currentImpliedSum.toFixed(4)}, target=${targetImpliedSum.toFixed(4)}`);
    
    if (Math.abs(currentImpliedSum - targetImpliedSum) <= TOLERANCE) {
      workingResults = workingResults.map(r => ({
        ...r,
        adjustedProbability: 1 / r.finalOdds
      }));
      return {
        correctedResults: workingResults,
        scalingFactor: Math.round(totalScalingFactor * 1000) / 1000,
        finalImpliedSum: currentImpliedSum
      };
    }
    
    const iterScalingFactor = currentImpliedSum / targetImpliedSum;
    const dampenedScalingFactor = 1 + (iterScalingFactor - 1) * 0.8;
    totalScalingFactor *= dampenedScalingFactor;
    
    if (iter < MAX_ITERATIONS - 1) {
      workingResults = workingResults.map(r => ({
        ...r,
        finalOdds: clampOdds(r.finalOdds * dampenedScalingFactor, maxMultiplier)
      }));
    } else {
      workingResults = workingResults.map(r => ({
        ...r,
        finalOdds: clampOdds(roundToLadder(r.finalOdds * dampenedScalingFactor), maxMultiplier)
      }));
    }
  }
  
  workingResults = workingResults.map(r => ({
    ...r,
    finalOdds: clampOdds(roundToLadder(r.finalOdds), maxMultiplier),
    adjustedProbability: 1 / clampOdds(roundToLadder(r.finalOdds), maxMultiplier)
  }));
  
  const finalImpliedSum = workingResults.reduce((sum, r) => sum + (1 / r.finalOdds), 0);
  
  return {
    correctedResults: workingResults,
    scalingFactor: Math.round(totalScalingFactor * 1000) / 1000,
    finalImpliedSum
  };
}

// ============ AUTO-CALIBRATION LOOP ============
/**
 * Iteratively reduce temperature until top-3 constraints pass
 */
function calibrateOdds(
  athletes: AthleteOddsInput[],
  marketType: string,
  sigma: number,
  houseEdge: number,
  multiplierMap: Map<string, number>
): { results: OddsResult[]; temperatureUsed: number; iterations: number; calibrationPassed: boolean } {
  const constraints = TOP3_CONSTRAINTS[marketType] || TOP3_CONSTRAINTS.WINNER;
  const maxMultiplier = MULTIPLIER_CAPS[marketType] || 15.0;
  let temperature = INITIAL_TEMPERATURE[marketType] || 12;
  
  console.log(`[CALIBRATION] Starting with temp=${temperature}, constraints: top1≤${constraints.top1Max}, top2≤${constraints.top2Max}, top3≤${constraints.top3Max}`);
  
  for (let iter = 0; iter < MAX_CALIBRATION_ITERATIONS; iter++) {
    // 1. Calculate power scores
    const athletesWithPower = athletes.map(a => ({
      athleteId: a.athleteId,
      powerScore: calculatePowerScore(a.rating, a.rank)
    }));
    
    // 2. Calculate prior probabilities
    const priorProbs = calculatePriorProbabilities(athletesWithPower, temperature);
    
    // 3. Run Monte Carlo
    let mcRaw: RawProbabilityResult[];
    switch (marketType) {
      case "WINNER":
        mcRaw = calculateWinnerProbabilities(athletes, temperature);
        break;
      case "PODIUM":
        mcRaw = calculatePodiumProbabilities(athletes, temperature, SIMS);
        break;
      case "HIGHEST_SCORE":
        mcRaw = calculateHighestScoreProbabilities(athletes, sigma, SIMS);
        break;
      default:
        mcRaw = calculateWinnerProbabilities(athletes, temperature);
    }
    
    // Normalize MC probabilities
    const mcSum = mcRaw.reduce((sum, r) => sum + r.rawProbability, 0);
    const mcProbs = new Map<string, number>();
    mcRaw.forEach(r => mcProbs.set(r.athleteId, r.rawProbability / mcSum));
    
    // 4. Blend prior + MC
    const blendedProbs = blendProbabilities(priorProbs, mcProbs, PRIOR_BLEND_ALPHA);
    
    // 5. Derive odds
    let results = deriveOddsFromBlendedProbabilities(
      athletes, priorProbs, mcProbs, blendedProbs, houseEdge, multiplierMap
    );
    
    // 6. Sort by probability (highest first = best athlete)
    results.sort((a, b) => b.blendedProbability - a.blendedProbability);
    
    // 7. Check top-3 constraints
    const top1Mult = results[0]?.finalOdds || 99;
    const top2Mult = results[1]?.finalOdds || 99;
    const top3Mult = results[2]?.finalOdds || 99;
    
    console.log(`[CALIBRATION] Iter ${iter + 1}: temp=${temperature.toFixed(2)}, top1=${top1Mult.toFixed(2)}x, top2=${top2Mult.toFixed(2)}x, top3=${top3Mult.toFixed(2)}x`);
    
    const passesConstraints = (
      top1Mult <= constraints.top1Max &&
      top2Mult <= constraints.top2Max &&
      top3Mult <= constraints.top3Max
    );
    
    if (passesConstraints) {
      console.log(`[CALIBRATION] ✓ Passed on iteration ${iter + 1} with temp=${temperature.toFixed(2)}`);
      return { results, temperatureUsed: temperature, iterations: iter + 1, calibrationPassed: true };
    }
    
    // 8. Reduce temperature by 10%
    temperature = temperature * TEMP_REDUCTION_FACTOR;
  }
  
  // Failed after max iterations - return last result with warning
  console.warn(`[CALIBRATION] ✗ Failed after ${MAX_CALIBRATION_ITERATIONS} iterations`);
  
  // Do one final calculation with lowest temperature
  const athletesWithPower = athletes.map(a => ({
    athleteId: a.athleteId,
    powerScore: calculatePowerScore(a.rating, a.rank)
  }));
  const priorProbs = calculatePriorProbabilities(athletesWithPower, temperature);
  
  let mcRaw: RawProbabilityResult[];
  switch (marketType) {
    case "WINNER":
      mcRaw = calculateWinnerProbabilities(athletes, temperature);
      break;
    case "PODIUM":
      mcRaw = calculatePodiumProbabilities(athletes, temperature, SIMS);
      break;
    case "HIGHEST_SCORE":
      mcRaw = calculateHighestScoreProbabilities(athletes, sigma, SIMS);
      break;
    default:
      mcRaw = calculateWinnerProbabilities(athletes, temperature);
  }
  
  const mcSum = mcRaw.reduce((sum, r) => sum + r.rawProbability, 0);
  const mcProbs = new Map<string, number>();
  mcRaw.forEach(r => mcProbs.set(r.athleteId, r.rawProbability / mcSum));
  
  const blendedProbs = blendProbabilities(priorProbs, mcProbs, PRIOR_BLEND_ALPHA);
  let results = deriveOddsFromBlendedProbabilities(
    athletes, priorProbs, mcProbs, blendedProbs, houseEdge, multiplierMap
  );
  results.sort((a, b) => b.blendedProbability - a.blendedProbability);
  
  return { results, temperatureUsed: temperature, iterations: MAX_CALIBRATION_ITERATIONS, calibrationPassed: false };
}

// ============ MAIN HANDLER ============
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

    // Get athletes from tournament_entries with rankings
    const { data: tournamentEntries, error: entriesError } = await supabase
      .from("tournament_entries")
      .select(`
        athlete_id,
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
      // Fallback to selections
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
      athleteInputs = filteredEntries.map((e: any) => {
        const a = e.athletes;
        const rating = disciplineLower === 'slalom' ? a.current_rating_slalom :
                      disciplineLower === 'trick' ? a.current_rating_trick : a.current_rating_jump;
        const rank = disciplineLower === 'slalom' ? a.current_rank_slalom :
                    disciplineLower === 'trick' ? a.current_rank_trick : a.current_rank_jump;
        return {
          athleteId: e.athlete_id,
          rating: rating ?? 70,
          rank: rank ?? null,
        };
      });
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

    // ============ RUN CALIBRATION ============
    const { results: calibratedResults, temperatureUsed, iterations, calibrationPassed } = calibrateOdds(
      athleteInputs, marketType, sigma, houseEdge, multiplierMap
    );

    // Apply hard multiplier caps
    let cappedResults = applyHardMultiplierCaps(calibratedResults, marketType);

    // Enforce target implied sum
    const { correctedResults, scalingFactor, finalImpliedSum } = enforceTargetImpliedSum(
      cappedResults, targetImpliedSum, maxMultiplier
    );

    // Validation
    const isWithinRange = finalImpliedSum >= acceptableRange.min && finalImpliedSum <= acceptableRange.max;
    let validationStatus = calibrationPassed ? 'VALID' : 'CALIBRATION_FAILED';
    let validationError: string | null = null;

    if (!calibrationPassed) {
      validationError = `Calibration failed after ${iterations} iterations. Top-3 constraints not met.`;
      console.warn(`[VALIDATION] ${validationError}`);
    } else if (finalImpliedSum < 0.70 || finalImpliedSum > 1.10) {
      validationStatus = 'INVALID';
      validationError = `Implied sum ${finalImpliedSum.toFixed(4)} outside safe range 0.70-1.10`;
    } else if (!isWithinRange) {
      validationError = `Implied sum ${finalImpliedSum.toFixed(4)} outside ideal band ${acceptableRange.min}-${acceptableRange.max}`;
    }

    const actualHouseEdgePct = ((1 / finalImpliedSum - 1) * 100).toFixed(2);

    // Log top 3
    console.log(`[RESULT] Top 3 athletes after calibration:`);
    correctedResults.slice(0, 3).forEach((r, i) => {
      console.log(`  #${i + 1}: powerScore=${r.powerScore.toFixed(1)}, prior=${(r.priorProbability * 100).toFixed(1)}%, mc=${(r.mcProbability * 100).toFixed(1)}%, blended=${(r.blendedProbability * 100).toFixed(1)}%, mult=${r.finalOdds.toFixed(2)}x`);
    });

    // Prepare upserts
    const now = new Date().toISOString();
    const marketOddsUpserts = correctedResults.map(result => ({
      market_id,
      athlete_id: result.athleteId,
      // NEW calibration columns
      power_score: Math.round(result.powerScore * 100) / 100,
      prior_probability: Math.round(result.priorProbability * 100000) / 100000,
      mc_probability: Math.round(result.mcProbability * 100000) / 100000,
      blended_probability: Math.round(result.blendedProbability * 100000) / 100000,
      temperature_used: Math.round(temperatureUsed * 100) / 100,
      calibration_iterations: iterations,
      athlete_rank: result.rank,
      // Standard columns
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
      model_version: 'v3-calibrated',
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

    // Sync selections table
    const selectionsUpserts = correctedResults.map(result => ({
      market_id,
      athlete_id: result.athleteId,
      decimal_odds: result.finalOdds,
      description: `${marketType} - Calibrated Monte Carlo`,
    }));

    const { error: selectionsError } = await supabase
      .from("selections")
      .upsert(selectionsUpserts, { onConflict: "market_id,athlete_id" });

    if (selectionsError) {
      console.error("[SYNC] Failed to sync selections:", selectionsError);
    }

    // Write audit log
    await writeAuditLog(supabase, {
      actor_type: 'system',
      action_type: 'ODDS_GENERATED_CALIBRATED',
      entity_type: 'market',
      entity_id: market_id,
      after_state: {
        athletes_processed: correctedResults.length,
        temperature_used: temperatureUsed,
        calibration_iterations: iterations,
        calibration_passed: calibrationPassed,
        target_implied_sum: Math.round(targetImpliedSum * 1000) / 1000,
        actual_implied_sum: Math.round(finalImpliedSum * 1000) / 1000,
        house_edge_pct: parseFloat(actualHouseEdgePct),
        validation_status: validationStatus,
        top3_multipliers: correctedResults.slice(0, 3).map(r => r.finalOdds),
        sims_run: SIMS,
      },
      metadata: {
        market_type: marketType,
        discipline: market.discipline,
        model_version: 'v3-calibrated',
      }
    });

    console.log(`[SUCCESS] Generated calibrated odds for ${correctedResults.length} athletes, temp=${temperatureUsed.toFixed(2)}, iterations=${iterations}, implied_sum=${finalImpliedSum.toFixed(4)}`);

    return new Response(
      JSON.stringify({
        success: true,
        market_id,
        market_type: marketType,
        athletes_processed: correctedResults.length,
        temperature_used: Math.round(temperatureUsed * 100) / 100,
        calibration_iterations: iterations,
        calibration_passed: calibrationPassed,
        target_implied_sum: Math.round(targetImpliedSum * 1000) / 1000,
        actual_implied_sum: Math.round(finalImpliedSum * 1000) / 1000,
        finalImpliedSum: Math.round(finalImpliedSum * 1000) / 1000,
        scaling_factor: scalingFactor,
        house_edge_pct: parseFloat(actualHouseEdgePct),
        is_within_range: isWithinRange,
        acceptable_range: acceptableRange,
        validation_status: validationStatus,
        top3_multipliers: correctedResults.slice(0, 3).map(r => ({
          athleteId: r.athleteId,
          multiplier: r.finalOdds,
          powerScore: r.powerScore,
          rank: r.rank
        })),
        sims_run: SIMS,
        model_version: 'v3-calibrated',
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const error = err as Error;
    console.error("Error in generate-market-odds:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
