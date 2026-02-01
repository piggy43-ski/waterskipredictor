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

// TARGET_EV_FACTOR: What fraction of fair odds players receive
// e.g., 0.91 = players get 91% of fair value = 9% house edge
// EV = probability × multiplier = probability × (fair_mult × ev_factor) = ev_factor
const TARGET_EV_FACTOR = {
  WINNER: { min: 0.90, max: 0.92 },       // 8-10% house edge
  PODIUM: { min: 0.84, max: 0.86 },       // 14-16% house edge  
  HIGHEST_SCORE: { min: 0.87, max: 0.89 }, // 11-13% house edge
};

const MULTIPLIER_CAPS = {
  WINNER: { min: 1.5, max: 20.0 },
  PODIUM: { min: 1.10, max: 8.0 },
  HIGHEST_SCORE: { min: 1.5, max: 12.0 },
};

// Realistic WINNER probability weight ladder
// Ranks 1-3: Top tier with clear separation
// Ranks 4-8: TIGHT CLUSTER - "very close and interchangeable" per domain knowledge
// Ranks 9+: Gradual decay begins
const WINNER_WEIGHT_LADDER: Record<number, number> = {
  1: 1.00, 2: 0.80, 3: 0.65, 4: 0.48, 5: 0.45,
  6: 0.42, 7: 0.40, 8: 0.38, 9: 0.30, 10: 0.24
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

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
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
  p_base: number;
  p_mc: number;
  p_blended: number;
  p_final: number;
  multiplier: number;
  source: 'auto' | 'manual';
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

function calculateWinnerBaseProbabilities(athletes: Athlete[]): { probs: number[], fieldRanks: Map<string, number> } {
  // Sort by world rank (lower = better), then by rating (higher = better)
  const sorted = [...athletes].sort((a, b) => {
    const aRank = a.worldRank ?? Infinity;
    const bRank = b.worldRank ?? Infinity;
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

// ============================================================
// STEP 2: MONTE CARLO ADJUSTMENT
// ============================================================
function runLightMonteCarlo(athletes: Athlete[], marketType: string): number[] {
  const rng = seededRandom(Date.now());
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
// p_blended = normalize(W_BASE * p_base + W_MC * p_mc)
// ============================================================
function blendProbabilities(p_base: number[], p_mc: number[]): number[] {
  const blended = p_base.map((pb, i) => W_BASE * pb + W_MC * p_mc[i]);
  return normalize(blended);
}

// ============================================================
// STEP 3.5: ENFORCE MONOTONIC PROBABILITIES (by field rank)
// Higher field rank (1) must have >= probability than lower rank (2, 3, ...)
// ============================================================
function enforceMonotonic(
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
  
  // Sort by field rank
  const sorted = [...athletes].sort((a, b) => a.fieldRank - b.fieldRank);
  
  // 1. Monotonic check: better rank should have >= probability
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
// STEP 5: APPLY HOUSE EDGE & DERIVE MULTIPLIERS
// ============================================================
function deriveMultipliers(
  p_final: number[], 
  marketType: string,
  fieldSize: number
): { multipliers: number[], impliedSum: number, edgeFactor: number } {
  const target = TARGET_EV_FACTOR[marketType as keyof typeof TARGET_EV_FACTOR] || TARGET_EV_FACTOR.WINNER;
  const caps = MULTIPLIER_CAPS[marketType as keyof typeof MULTIPLIER_CAPS] || MULTIPLIER_CAPS.WINNER;
  const targetMid = (target.min + target.max) / 2;
  
  // Dynamic cap scaling for large fields to prevent clumping at max
  const fieldSizeAdjustment = Math.max(1, fieldSize / 20);
  const dynamicMax = Math.min(caps.max * fieldSizeAdjustment, 25.0);
  
  // HOUSE EDGE FORMULA:
  // We want implied_sum = SUM(1/mult) = target (e.g., 0.91)
  // If p_i are normalized probabilities (sum to 1), set:
  //   q_i = p_i * targetImpliedSum  (adjusted prob, sums to targetImpliedSum)
  //   mult_i = 1 / q_i
  // Then implied_sum = SUM(1/mult_i) = SUM(q_i) = targetImpliedSum ✓
  //
  // EV for player betting on outcome i:
  //   EV = p_i * mult_i = p_i / (p_i * target) = 1/target = 1/0.91 ≈ 1.10
  //
  // Wait - that means player has +EV! That's WRONG for house edge.
  //
  // CORRECT UNDERSTANDING:
  // - Sportsbook implied_sum > 1 = house edge (overround)
  // - Our target < 1 = actually gives players edge
  //
  // SOLUTION: Use actual house edge multiplier reduction
  // House edge = 1 - EV_player = 1 - (p * mult) 
  // We want EV_player < 1, so mult < 1/p
  // mult = (1/p) * (1 - house_edge_pct)
  //
  // For 9% house edge: mult = (1/p) * 0.91
  // Then EV = p * mult = p * (0.91/p) = 0.91 ✓ House keeps 9%
  // BUT: implied_sum = SUM(1/mult) = SUM(p/0.91) = 1/0.91 ≈ 1.10
  //
  // So: implied_sum ~1.10 is CORRECT for 9% house edge!
  // The target bands 0.90-0.92 were conceptually inverted.
  //
  // For now: implement multiplier = (1/p) * (1 - houseEdgePct)
  // And accept implied_sum will be ~1.10 (which IS house edge)
  
  const houseEdgePct = 1 - targetMid; // e.g., 0.09 for 9% edge
  const evFactor = 1 - houseEdgePct; // 0.91
  
  let multipliers = p_final.map(p => {
    if (p <= 0) return dynamicMax;
    const m_fair = 1 / p;
    let m = m_fair * evFactor;  // Reduces multiplier = house edge
    m = clamp(m, caps.min, dynamicMax);
    return roundToLadder(m);
  });
  
  // Calculate what implied_sum we actually got (will be ~1/evFactor if no clipping)
  const impliedSum = multipliers.reduce((s, m) => s + (1 / m), 0);
  
  // Note: We no longer try to hit targetMid for implied_sum
  // because our multiplier model creates implied_sum > 1 by design
  
  return { multipliers, impliedSum, edgeFactor: evFactor };
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
    
    // Define rank/rating keys BEFORE using them in filter
    const rankKey = `current_rank_${market.discipline}`;
    const ratingKey = `current_rating_${market.discipline}`;
    
    // Filter by gender AND discipline specialization
    // Athletes must have a WORLD rank OR discipline_rank (from tournament) OR meaningful rating in THIS discipline
    // seed_rank alone is NOT sufficient - it's just ordering, not actual ranking
    const filtered = entries?.filter(e => {
      const a = e.athletes as any;
      if (a?.gender !== genderFilter) return false;
      
      // Check if athlete has discipline-specific data
      const worldRank = a[rankKey]; // current_rank_{discipline} from athletes table
      const disciplineRating = a[ratingKey]; // current_rating_{discipline} from athletes table
      const entryDisciplineRank = e.discipline_rank; // actual discipline rank from entry (not seed_rank)
      const entryRating = e.rating_0_100;
      
      // Must have REAL discipline data, not just seed_rank
      // Include if: has world rank OR has entry discipline_rank OR has rating above default
      const hasWorldRank = worldRank !== null && worldRank !== undefined;
      const hasEntryDisciplineRank = entryDisciplineRank !== null && entryDisciplineRank !== undefined;
      const hasMeaningfulRating = (entryRating && entryRating > 70) || (disciplineRating && disciplineRating > 70);
      
      return hasWorldRank || hasEntryDisciplineRank || hasMeaningfulRating;
    }) || [];
    
    console.log(`[ODDS] Filtered: ${filtered.length} specialists from ${entries?.length || 0} entries (excluded seed-only athletes)`);
    
    if (filtered.length < 2) {
      await supabase.from('markets').update({
        odds_validation_status: 'INVALID',
        odds_validation_error: 'Insufficient specialists for this discipline'
      }).eq('id', market_id);
      return new Response(JSON.stringify({ error: "Insufficient specialists" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch probability overrides (not multiplier overrides)
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
    
    // Step 1: Calculate base winner probabilities using weight ladder
    const { probs: p_winner_base, fieldRanks } = calculateWinnerBaseProbabilities(athletes);
    
    // Transform to market-specific base probabilities
    let p_base: number[];
    if (marketType === 'PODIUM') {
      p_base = transformToPodiumProbabilities(p_winner_base);
    } else if (marketType === 'HIGHEST_SCORE') {
      p_base = transformToHighestScoreProbabilities(p_winner_base);
    } else {
      p_base = p_winner_base;
    }
    
    // Step 2: Monte Carlo adjustment
    const p_mc = runLightMonteCarlo(athletes, marketType);
    
    // Step 3: Blend
    const p_blended_raw = blendProbabilities(p_base, p_mc);
    
    // Step 3.5: Enforce monotonic ordering (rank 1 >= rank 2 >= rank 3 ...)
    const athleteIds = athletes.map(a => a.id);
    const p_blended = enforceMonotonic(p_blended_raw, fieldRanks, athleteIds);
    
    // Step 4: Apply manual overrides if any
    let p_final: number[];
    if (hasManualProbabilities) {
      // Use manual probabilities where provided, otherwise use blended
      const rawProbs = athletes.map((a, i) => {
        if (a.manualProbability && a.manualProbability > 0) {
          return a.manualProbability;
        }
        return p_blended[i];
      });
      // Re-normalize since manual might not sum to 1
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
    
    // Step 6: Derive multipliers with house edge
    const { multipliers, impliedSum, edgeFactor } = deriveMultipliers(p_final, marketType, athletes.length);

    // Build results
    const results: AthleteResult[] = athletes.map((a, i) => ({
      ...a,
      fieldRank: fieldRanks.get(a.id)!,
      p_base: p_base[i],
      p_mc: p_mc[i],
      p_blended: p_blended[i],
      p_final: p_final[i],
      multiplier: multipliers[i],
      source: (a.manualProbability && a.manualProbability > 0) ? 'manual' as const : 'auto' as const
    }));

    console.log(`[ODDS] Implied sum: ${impliedSum.toFixed(4)}, Valid: ${validation.passed}`);
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
      console.log(`  #${r.fieldRank} ${r.name}: rating=${r.rating}, p_base=${(r.p_base*100).toFixed(1)}%, p_mc=${(r.p_mc*100).toFixed(1)}%, p_final=${(r.p_final*100).toFixed(1)}% → ${r.multiplier}x [${r.source}]`);
    });

    // Determine validation status
    const validationStatus = validation.passed ? 'VALID' : 'INVALID';
    
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
      
      // Upsert market_odds with ALL probability columns
      await supabase.from('market_odds').upsert({
        market_id,
        athlete_id: r.id,
        // Core probability columns
        base_probability: r.p_final,  // Final probability for UI display
        prior_probability: r.p_base,  // Raw ladder weight for audit
        mc_probability: r.p_mc,
        blended_probability: r.p_blended,
        normalized_probability: r.p_final,
        adjusted_probability: 1 / r.multiplier,
        // Multiplier columns
        multiplier: r.multiplier,
        base_decimal_odds: r.multiplier,
        final_decimal_odds: r.multiplier,
        american_odds: decimalToAmerican(r.multiplier),
        // Rank/rating info
        field_rank: r.fieldRank,
        athlete_rank: r.fieldRank,
        world_rank: r.worldRank,
        rating: r.rating,
        // Metadata
        sims_run: SIMS,
        model_version: 'ladder-v2',
        probability_source: r.source
      }, { onConflict: 'market_id,athlete_id' });
    }

    await supabase.from('markets').update({
      odds_validation_status: validationStatus,
      odds_validation_error: validation.passed ? null : [...validation.errors, ...validation.warnings].join('; '),
      odds_generated_at: new Date().toISOString(),
      implied_sum: impliedSum
    }).eq('id', market_id);

    await supabase.from('audit_logs').insert({
      event_type: 'odds_generated',
      target_type: 'market',
      target_id: market_id,
      payload: {
        market_type: marketType,
        field_size: results.length,
        implied_sum: impliedSum,
        edge_factor: edgeFactor,
        model_version: 'ladder-v2',
        sims: SIMS,
        w_base: W_BASE,
        w_mc: W_MC,
        has_manual_overrides: hasManualProbabilities,
        validation_status: validationStatus,
        validation_errors: validation.errors,
        validation_warnings: validation.warnings
      }
    });

    console.log(`[ODDS] ✅ Done`);

    // Build debug table for response
    const debugTable = sortedResults.map(r => ({
      athlete: r.name,
      rank_used: r.fieldRank,
      world_rank: r.worldRank,
      rating_used: r.rating,
      p_base: `${(r.p_base * 100).toFixed(1)}%`,
      p_mc: `${(r.p_mc * 100).toFixed(1)}%`,
      p_final: `${(r.p_final * 100).toFixed(1)}%`,
      multiplier: `${r.multiplier}x`,
      source: r.source
    }));

    return new Response(JSON.stringify({
      success: true,
      market_id,
      market_type: marketType,
      field_size: results.length,
      implied_sum: impliedSum,
      edge_factor: edgeFactor,
      validation_status: validationStatus,
      validation_errors: validation.errors,
      validation_warnings: validation.warnings,
      model_version: 'ladder-v2',
      debug_table: debug ? debugTable : undefined,
      top_athletes: sortedResults.slice(0, 5).map(r => ({
        name: r.name,
        fieldRank: r.fieldRank,
        worldRank: r.worldRank,
        rating: r.rating,
        p_base: `${(r.p_base * 100).toFixed(1)}%`,
        p_mc: `${(r.p_mc * 100).toFixed(1)}%`,
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
