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

// Constants
const TAU: Record<string, number> = { slalom: 14, trick: 22, jump: 12 };
const SIGMA: Record<string, number> = { slalom: 6, trick: 10, jump: 8 };
const SIMS = 20000;
const BANKROLL_UNIT = 100000;
const ODDS_MIN = 1.20;
const ODDS_MAX = 25.0;
const DEFAULT_MANUAL_MULTIPLIER = 0.97;

// House edge by market type (this is the % above fair odds)
// e.g., 0.10 = 10% house edge, resulting in implied_sum = 1/(1+0.10) = 0.909
const HOUSE_EDGE: Record<string, number> = {
  WINNER: 0.10,        // 10% edge → implied_sum = 0.909
  PODIUM: 0.18,        // 18% edge → implied_sum = 0.847
  HIGHEST_SCORE: 0.14  // 14% edge → implied_sum = 0.877
};

// Acceptable ranges for implied sum validation
const IMPLIED_SUM_RANGES: Record<string, { min: number; max: number }> = {
  WINNER: { min: 0.90, max: 0.915 },
  PODIUM: { min: 0.84, max: 0.86 },
  HIGHEST_SCORE: { min: 0.87, max: 0.89 }
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

function clampOdds(odds: number): number {
  return Math.max(ODDS_MIN, Math.min(ODDS_MAX, odds));
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

interface AthleteOddsInput {
  athleteId: string;
  rating: number;
}

interface RawProbabilityResult {
  athleteId: string;
  rawProbability: number;  // Before normalization
  winCount: number;        // For debugging
}

interface OddsResult {
  athleteId: string;
  normalizedProbability: number;  // MUST sum to 1.0
  fairOdds: number;               // 1 / normalizedProbability
  adjustedProbability: number;    // normalizedProbability * (1 + houseEdge)
  finalOdds: number;              // After house edge, rounding, manual multiplier
  manualMultiplier: number;
}

/**
 * WINNER Markets: Softmax produces probabilities that naturally sum to 1.0
 */
function calculateWinnerProbabilities(athletes: AthleteOddsInput[], tau: number): RawProbabilityResult[] {
  const strengths = athletes.map(a => Math.exp(a.rating / tau));
  const totalStrength = strengths.reduce((a, b) => a + b, 0);
  
  return athletes.map((athlete, i) => ({
    athleteId: athlete.athleteId,
    rawProbability: strengths[i] / totalStrength,
    winCount: Math.round((strengths[i] / totalStrength) * SIMS), // Synthetic for logging
  }));
}

/**
 * PODIUM Markets: Monte Carlo simulation for top-3 finish
 * CRITICAL FIX: Raw probabilities sum to ~3.0 (3 athletes per sim), so MUST normalize
 */
function calculatePodiumProbabilities(athletes: AthleteOddsInput[], tau: number, sims: number): RawProbabilityResult[] {
  const weights = athletes.map(a => Math.exp(a.rating / tau));
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

  // Raw probability = count / sims → sums to ~3.0 (since 3 athletes win per sim)
  return athletes.map(athlete => {
    const count = top3Counts.get(athlete.athleteId) || 0;
    return {
      athleteId: athlete.athleteId,
      rawProbability: count / sims,  // This will sum to ~3.0
      winCount: count,
    };
  });
}

/**
 * HIGHEST_SCORE Markets: Monte Carlo with normal distribution
 * Only 1 winner per simulation, so raw probabilities sum to 1.0
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
      const score = normalRandom(athlete.rating, sigma);
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
      rawProbability: count / sims,  // Sums to 1.0
      winCount: count,
    };
  });
}

/**
 * CRITICAL: Normalize probabilities to sum to exactly 1.0
 * This is MANDATORY before applying house edge
 */
function normalizeProbabilities(results: RawProbabilityResult[]): { athleteId: string; normalizedProbability: number }[] {
  const rawSum = results.reduce((sum, r) => sum + r.rawProbability, 0);
  
  console.log(`[NORMALIZE] Raw probability sum: ${rawSum.toFixed(4)}`);
  
  // Normalize to 1.0
  return results.map(r => ({
    athleteId: r.athleteId,
    normalizedProbability: r.rawProbability / rawSum,
  }));
}

/**
 * Derive odds from normalized probabilities with house edge
 * 
 * Formula:
 * 1. Fair odds = 1 / normalizedProbability
 * 2. Adjusted probability = normalizedProbability * (1 + houseEdge)
 * 3. Final odds = 1 / adjustedProbability
 * 
 * This guarantees: implied_sum = Σ(adjustedProbability) = 1 * (1 + houseEdge)
 * And: Σ(1/finalOdds) = 1 / (1 + houseEdge) = target implied sum
 */
function deriveOddsFromProbabilities(
  normalizedProbs: { athleteId: string; normalizedProbability: number }[],
  houseEdge: number,
  multiplierMap: Map<string, number>
): OddsResult[] {
  return normalizedProbs.map(({ athleteId, normalizedProbability }) => {
    const fairOdds = 1 / normalizedProbability;
    const adjustedProbability = normalizedProbability * (1 + houseEdge);
    const rawFinalOdds = 1 / adjustedProbability;
    
    // Apply manual multiplier (for admin adjustments)
    const manualMultiplier = multiplierMap.get(athleteId) ?? DEFAULT_MANUAL_MULTIPLIER;
    const adjustedOdds = rawFinalOdds * manualMultiplier;
    
    // Round to ladder and clamp
    const finalOdds = clampOdds(roundToLadder(adjustedOdds));
    
    return {
      athleteId,
      normalizedProbability,
      fairOdds,
      adjustedProbability,
      finalOdds,
      manualMultiplier,
    };
  });
}

/**
 * Post-processing: Normalize final odds to guarantee target implied sum
 * This corrects for rounding/clamping drift
 */
function enforceTargetImpliedSum(
  results: OddsResult[],
  targetImpliedSum: number
): { correctedResults: OddsResult[]; scalingFactor: number; finalImpliedSum: number } {
  // Calculate current implied sum after rounding
  const currentImpliedSum = results.reduce((sum, r) => sum + (1 / r.finalOdds), 0);
  
  console.log(`[ENFORCE] Current implied sum: ${currentImpliedSum.toFixed(4)}, Target: ${targetImpliedSum.toFixed(4)}`);
  
  // If already within tolerance, return as-is
  if (Math.abs(currentImpliedSum - targetImpliedSum) < 0.005) {
    return {
      correctedResults: results,
      scalingFactor: 1.0,
      finalImpliedSum: currentImpliedSum
    };
  }
  
  // Calculate scaling factor
  // If currentImpliedSum > target, we need to INCREASE odds (scale up)
  // If currentImpliedSum < target, we need to DECREASE odds (scale down)
  const scalingFactor = currentImpliedSum / targetImpliedSum;
  
  console.log(`[ENFORCE] Scaling factor: ${scalingFactor.toFixed(4)}`);
  
  // Apply scaling and re-round
  const correctedResults = results.map(r => ({
    ...r,
    finalOdds: clampOdds(roundToLadder(r.finalOdds * scalingFactor))
  }));
  
  // Recalculate final implied sum
  const finalImpliedSum = correctedResults.reduce((sum, r) => sum + (1 / r.finalOdds), 0);
  
  console.log(`[ENFORCE] Final implied sum: ${finalImpliedSum.toFixed(4)}`);
  
  return {
    correctedResults,
    scalingFactor: Math.round(scalingFactor * 1000) / 1000,
    finalImpliedSum
  };
}

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
      .select("id, discipline, category, market_type")
      .eq("id", market_id)
      .single();

    if (marketError || !market) {
      return new Response(
        JSON.stringify({ error: "Market not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get athletes from selections table (this is where athlete-market mappings are stored)
    const { data: marketSelections, error: marketSelectionsError } = await supabase
      .from("selections")
      .select("athlete_id")
      .eq("market_id", market_id);

    if (marketSelectionsError) throw marketSelectionsError;
    if (!marketSelections || marketSelections.length === 0) {
      return new Response(
        JSON.stringify({ error: "No selections found for market" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const athleteIds = [...new Set(marketSelections.map(s => s.athlete_id))];
    const discipline = market.discipline.toLowerCase();
    const marketType = market.market_type.toUpperCase();

    console.log(`[GENERATE] Market: ${market_id}, Type: ${marketType}, Athletes: ${athleteIds.length}`);

    // Fetch athlete ratings
    const { data: athletes, error: athletesError } = await supabase
      .from("athletes")
      .select("id, current_rating_slalom, current_rating_trick, current_rating_jump")
      .in("id", athleteIds);

    if (athletesError) throw athletesError;
    if (!athletes) {
      return new Response(
        JSON.stringify({ error: "No athletes found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const athleteInputs: AthleteOddsInput[] = athletes.map(a => {
      const rating = discipline === 'slalom' ? a.current_rating_slalom :
                    discipline === 'trick' ? a.current_rating_trick : a.current_rating_jump;
      return {
        athleteId: a.id,
        rating: rating ?? 70,
      };
    });

    const tau = TAU[discipline] ?? 14;
    const sigma = SIGMA[discipline] ?? 6;
    const houseEdge = HOUSE_EDGE[marketType] ?? 0.10;
    const targetImpliedSum = 1 / (1 + houseEdge);  // Derived from house edge
    const acceptableRange = IMPLIED_SUM_RANGES[marketType] || IMPLIED_SUM_RANGES.WINNER;

    console.log(`[PARAMS] tau=${tau}, sigma=${sigma}, houseEdge=${houseEdge}, targetImpliedSum=${targetImpliedSum.toFixed(4)}`);

    // STEP 1: Calculate raw probabilities from Monte Carlo
    let rawProbabilities: RawProbabilityResult[];

    switch (marketType) {
      case "WINNER":
        rawProbabilities = calculateWinnerProbabilities(athleteInputs, tau);
        break;
      case "PODIUM":
        rawProbabilities = calculatePodiumProbabilities(athleteInputs, tau, SIMS);
        break;
      case "HIGHEST_SCORE":
        rawProbabilities = calculateHighestScoreProbabilities(athleteInputs, sigma, SIMS);
        break;
      default:
        rawProbabilities = calculateWinnerProbabilities(athleteInputs, tau);
    }

    // STEP 2: Validate raw probability sum
    const rawSum = rawProbabilities.reduce((sum, r) => sum + r.rawProbability, 0);
    console.log(`[VALIDATION] Raw probability sum: ${rawSum.toFixed(4)} (expected ~1.0 for WINNER/HIGHEST_SCORE, ~3.0 for PODIUM)`);

    // STEP 3: Normalize probabilities to sum to 1.0
    const normalizedProbs = normalizeProbabilities(rawProbabilities);
    
    // Validate normalization
    const normalizedSum = normalizedProbs.reduce((sum, r) => sum + r.normalizedProbability, 0);
    if (normalizedSum < 0.98 || normalizedSum > 1.02) {
      throw new Error(`VALIDATION FAILED: Normalized probability sum ${normalizedSum.toFixed(4)} not near 1.0`);
    }
    console.log(`[VALIDATION] Normalized probability sum: ${normalizedSum.toFixed(4)} ✓`);

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

    // STEP 4: Derive odds from normalized probabilities
    const oddsResults = deriveOddsFromProbabilities(normalizedProbs, houseEdge, multiplierMap);

    // STEP 5: Enforce target implied sum (correct for rounding drift)
    const { correctedResults, scalingFactor, finalImpliedSum } = enforceTargetImpliedSum(oddsResults, targetImpliedSum);

    // STEP 6: Final validation
    if (finalImpliedSum < 0.75 || finalImpliedSum > 1.05) {
      throw new Error(`VALIDATION FAILED: Final implied sum ${finalImpliedSum.toFixed(4)} outside safe range 0.75-1.05`);
    }

    const isWithinRange = finalImpliedSum >= acceptableRange.min && finalImpliedSum <= acceptableRange.max;
    if (!isWithinRange) {
      console.warn(`[WARNING] Final implied sum ${finalImpliedSum.toFixed(4)} outside target band ${acceptableRange.min}-${acceptableRange.max}`);
    }

    // Calculate house edge percentage for display
    const actualHouseEdgePct = ((1 / finalImpliedSum - 1) * 100).toFixed(2);

    // Prepare upserts for market_odds
    const now = new Date().toISOString();
    const marketOddsUpserts = correctedResults.map(result => ({
      market_id,
      athlete_id: result.athleteId,
      base_probability: Math.round(result.normalizedProbability * 10000) / 10000,
      base_decimal_odds: Math.round(result.fairOdds * 100) / 100,
      manual_multiplier: result.manualMultiplier,
      final_decimal_odds: result.finalOdds,
      token_price: Math.round(BANKROLL_UNIT / result.normalizedProbability),
      overround: 1 + houseEdge,
      tau,
      sims: marketType === "WINNER" ? null : SIMS,
      target_implied_sum: Math.round(targetImpliedSum * 1000) / 1000,
      scaling_factor: scalingFactor,
      generated_at: now,
      is_frozen: false,
    }));

    // Upsert market_odds
    const { error: upsertError } = await supabase
      .from("market_odds")
      .upsert(marketOddsUpserts, { onConflict: "market_id,athlete_id" });

    if (upsertError) throw upsertError;

    // STEP 7: CRITICAL - Sync selections table with market_odds
    // This ensures the Risk Dashboard (which reads from selections) shows correct values
    const selectionsUpserts = correctedResults.map(result => ({
      market_id,
      athlete_id: result.athleteId,
      decimal_odds: result.finalOdds,
      description: `${marketType} - Monte Carlo generated`, // Update description
    }));

    const { error: selectionsError } = await supabase
      .from("selections")
      .upsert(selectionsUpserts, { onConflict: "market_id,athlete_id" });

    if (selectionsError) {
      console.error("[SYNC] Failed to sync selections table:", selectionsError);
      // Don't throw - market_odds is the source of truth
    } else {
      console.log(`[SYNC] Updated ${selectionsUpserts.length} selections with Monte Carlo odds`);
    }

    // Write audit log
    await writeAuditLog(supabase, {
      actor_type: 'system',
      action_type: 'ODDS_GENERATED',
      entity_type: 'market',
      entity_id: market_id,
      before_state: existingOdds && existingOdds.length > 0 ? {
        previous_odds_count: existingOdds.length,
        was_frozen: existingOdds[0]?.is_frozen
      } : null,
      after_state: {
        athletes_processed: correctedResults.length,
        raw_probability_sum: Math.round(rawSum * 1000) / 1000,
        normalized_probability_sum: Math.round(normalizedSum * 1000) / 1000,
        target_implied_sum: Math.round(targetImpliedSum * 1000) / 1000,
        actual_implied_sum: Math.round(finalImpliedSum * 1000) / 1000,
        scaling_factor: scalingFactor,
        house_edge_pct: parseFloat(actualHouseEdgePct),
        is_within_range: isWithinRange,
        selections_synced: !selectionsError,
      },
      metadata: {
        market_type: marketType,
        discipline: market.discipline,
        category: market.category,
        house_edge: houseEdge,
        tau,
        sigma,
        sims: marketType === "WINNER" ? null : SIMS,
      }
    });

    console.log(`[SUCCESS] Generated odds for ${correctedResults.length} athletes, implied_sum=${finalImpliedSum.toFixed(4)}, house_edge=${actualHouseEdgePct}%`);

    return new Response(
      JSON.stringify({
        success: true,
        market_id,
        market_type: marketType,
        athletes_processed: correctedResults.length,
        raw_probability_sum: Math.round(rawSum * 1000) / 1000,
        normalized_probability_sum: Math.round(normalizedSum * 1000) / 1000,
        target_implied_sum: Math.round(targetImpliedSum * 1000) / 1000,
        actual_implied_sum: Math.round(finalImpliedSum * 1000) / 1000,
        scaling_factor: scalingFactor,
        house_edge_pct: parseFloat(actualHouseEdgePct),
        is_within_range: isWithinRange,
        acceptable_range: acceptableRange,
        selections_synced: !selectionsError,
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
