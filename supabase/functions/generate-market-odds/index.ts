import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Constants
const TAU: Record<string, number> = { slalom: 14, trick: 22, jump: 12 };
const OVERROUND: Record<string, number> = { WINNER: 1.10, PODIUM: 1.18, HIGHEST_SCORE: 1.14 };
const SIGMA: Record<string, number> = { slalom: 6, trick: 10, jump: 8 };
const SIMS = 20000;
const BANKROLL_UNIT = 100000;
const ODDS_MIN = 1.20;
const ODDS_MAX = 25.0;
const DEFAULT_MANUAL_MULTIPLIER = 0.97;

// Target implied sums for house edge (1/overround)
const TARGET_IMPLIED_SUM: Record<string, number> = {
  WINNER: 0.909,      // 1/1.10 - ensures ~10% house edge
  PODIUM: 0.847,      // 1/1.18 - ensures ~18% house edge
  HIGHEST_SCORE: 0.877 // 1/1.14 - ensures ~14% house edge
};

// Acceptable ranges for implied sum (target +/- tolerance)
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

interface OddsResult {
  athleteId: string;
  probability: number;
  baseOdds: number;
  finalOdds: number;
  manualMultiplier: number;
}

function calculateWinnerOdds(athletes: AthleteOddsInput[], tau: number, overround: number) {
  // Softmax for WINNER
  const strengths = athletes.map(a => Math.exp(a.rating / tau));
  const totalStrength = strengths.reduce((a, b) => a + b, 0);
  
  return athletes.map((athlete, i) => {
    const probability = strengths[i] / totalStrength;
    const baseOdds = overround / probability;
    return {
      athleteId: athlete.athleteId,
      probability,
      baseOdds: clampOdds(baseOdds),
    };
  });
}

function calculatePodiumOdds(athletes: AthleteOddsInput[], tau: number, overround: number, sims: number) {
  // Monte Carlo for PODIUM (top 3)
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

  return athletes.map(athlete => {
    const count = top3Counts.get(athlete.athleteId) || 0;
    const probability = Math.max(0.001, count / sims); // Minimum probability to avoid division by zero
    const baseOdds = overround / probability;
    return {
      athleteId: athlete.athleteId,
      probability,
      baseOdds: clampOdds(baseOdds),
    };
  });
}

function calculateHighestScoreOdds(athletes: AthleteOddsInput[], sigma: number, overround: number, sims: number) {
  // Monte Carlo for HIGHEST_SCORE
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
    const probability = Math.max(0.001, count / sims);
    const baseOdds = overround / probability;
    return {
      athleteId: athlete.athleteId,
      probability,
      baseOdds: clampOdds(baseOdds),
    };
  });
}

/**
 * Normalize multipliers to hit the target implied sum (house edge enforcement).
 * This runs AFTER manual multipliers and rounding to guarantee the house edge.
 */
function normalizeToTarget(
  results: OddsResult[],
  targetImpliedSum: number
): { normalizedResults: OddsResult[]; scalingFactor: number; finalImpliedSum: number } {
  // Calculate current implied sum
  let currentImpliedSum = results.reduce((sum, r) => sum + (1 / r.finalOdds), 0);
  
  // If already at or below target, no scaling needed
  if (currentImpliedSum <= targetImpliedSum) {
    return {
      normalizedResults: results,
      scalingFactor: 1.0,
      finalImpliedSum: currentImpliedSum
    };
  }
  
  // Calculate scaling factor to bring implied sum down to target
  const scalingFactor = currentImpliedSum / targetImpliedSum;
  
  // Apply scaling, re-round, and re-clamp
  const normalizedResults = results.map(r => ({
    ...r,
    finalOdds: clampOdds(roundToLadder(r.finalOdds * scalingFactor))
  }));
  
  // Recalculate final implied sum after normalization
  const finalImpliedSum = normalizedResults.reduce((sum, r) => sum + (1 / r.finalOdds), 0);
  
  return {
    normalizedResults,
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

    // Get active entries for this market
    const { data: entries, error: entriesError } = await supabase
      .from("market_entries")
      .select("athlete_id")
      .eq("market_id", market_id)
      .eq("is_active", true);

    if (entriesError) throw entriesError;
    if (!entries || entries.length === 0) {
      return new Response(
        JSON.stringify({ error: "No active entries in market" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const athleteIds = entries.map(e => e.athlete_id);
    const discipline = market.discipline.toLowerCase();

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
    const overround = OVERROUND[market.market_type] ?? 1.10;
    const sigma = SIGMA[discipline] ?? 6;
    const targetImpliedSum = TARGET_IMPLIED_SUM[market.market_type] ?? 0.909;

    // Calculate odds based on market type
    let calculatedOdds: { athleteId: string; probability: number; baseOdds: number }[];

    switch (market.market_type) {
      case "WINNER":
        calculatedOdds = calculateWinnerOdds(athleteInputs, tau, overround);
        break;
      case "PODIUM":
        calculatedOdds = calculatePodiumOdds(athleteInputs, tau, overround, SIMS);
        break;
      case "HIGHEST_SCORE":
        calculatedOdds = calculateHighestScoreOdds(athleteInputs, sigma, overround, SIMS);
        break;
      default:
        calculatedOdds = calculateWinnerOdds(athleteInputs, tau, overround);
    }

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

    // Step 1: Apply manual multipliers and initial rounding
    let results: OddsResult[] = calculatedOdds.map(calc => {
      const manualMultiplier = multiplierMap.get(calc.athleteId) ?? DEFAULT_MANUAL_MULTIPLIER;
      const finalOdds = clampOdds(roundToLadder(calc.baseOdds * manualMultiplier));
      return {
        athleteId: calc.athleteId,
        probability: calc.probability,
        baseOdds: calc.baseOdds,
        finalOdds,
        manualMultiplier,
      };
    });

    // Step 2: CRITICAL - Normalize to enforce house edge AFTER all adjustments
    const { normalizedResults, scalingFactor, finalImpliedSum } = normalizeToTarget(results, targetImpliedSum);

    // Prepare upserts with normalized values
    const now = new Date().toISOString();
    const upserts = normalizedResults.map(result => {
      const tokenPrice = Math.round(BANKROLL_UNIT / result.probability);

      return {
        market_id,
        athlete_id: result.athleteId,
        base_probability: Math.round(result.probability * 10000) / 10000,
        base_decimal_odds: Math.round(result.baseOdds * 100) / 100,
        manual_multiplier: result.manualMultiplier,
        final_decimal_odds: result.finalOdds,
        token_price: tokenPrice,
        overround,
        tau,
        sims: market.market_type === "WINNER" ? null : SIMS,
        target_implied_sum: targetImpliedSum,
        scaling_factor: scalingFactor,
        generated_at: now,
        is_frozen: false,
      };
    });

    // Upsert all odds
    const { error: upsertError } = await supabase
      .from("market_odds")
      .upsert(upserts, { onConflict: "market_id,athlete_id" });

    if (upsertError) throw upsertError;

    // Calculate house edge percentage
    const houseEdgePct = ((1 / finalImpliedSum - 1) * 100).toFixed(2);
    const acceptableRange = IMPLIED_SUM_RANGES[market.market_type] || IMPLIED_SUM_RANGES.WINNER;
    const isWithinRange = finalImpliedSum >= acceptableRange.min && finalImpliedSum <= acceptableRange.max;

    return new Response(
      JSON.stringify({
        success: true,
        market_id,
        market_type: market.market_type,
        athletes_processed: normalizedResults.length,
        target_implied_sum: targetImpliedSum,
        actual_implied_sum: Math.round(finalImpliedSum * 1000) / 1000,
        scaling_factor: scalingFactor,
        house_edge_pct: parseFloat(houseEdgePct),
        is_within_range: isWithinRange,
        acceptable_range: acceptableRange,
        overround,
        tau,
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
