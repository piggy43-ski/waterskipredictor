import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================
// CONFIGURATION
// ============================================================
const SIMS = 5000;  // Light MC for adjustment only
const W_BASE = 0.85;  // 85% weight on rank-based formula
const W_MC = 0.15;    // 15% weight on Monte Carlo

const TARGET_IMPLIED_SUM = {
  WINNER: { min: 0.90, max: 0.915 },
  PODIUM: { min: 0.84, max: 0.86 },
  HIGHEST_SCORE: { min: 0.87, max: 0.89 },
};

const MULTIPLIER_CAPS = {
  WINNER: { min: 1.5, max: 15.0 },
  PODIUM: { min: 1.25, max: 8.0 },
  HIGHEST_SCORE: { min: 1.5, max: 12.0 },
};

const ODDS_LADDER = [
  1.25, 1.30, 1.35, 1.40, 1.45, 1.50, 1.55, 1.60, 1.65, 1.70, 1.75, 1.80, 1.85, 1.90, 1.95,
  2.00, 2.10, 2.20, 2.30, 2.40, 2.50, 2.60, 2.70, 2.80, 2.90,
  3.00, 3.20, 3.40, 3.60, 3.80,
  4.00, 4.20, 4.40, 4.60, 4.80,
  5.00, 5.25, 5.50, 5.75,
  6.00, 6.25, 6.50, 6.75,
  7.00, 7.50, 8.00, 8.50, 9.00, 9.50,
  10.00, 10.50, 11.00, 11.50, 12.00, 12.50, 13.00, 13.50, 14.00, 14.50, 15.00
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
  manualMultiplier?: number | null;
}

interface AthleteResult extends Athlete {
  fieldRank: number;
  p_base: number;
  p_mc: number;
  p_final: number;
  multiplier: number;
}

// ============================================================
// STEP 1: BASE PROBABILITY (Rank-based formula)
// p_base ∝ 1 / (fieldRank ^ power)
// Power varies by market type for sharper/flatter curves
// ============================================================
function calculateBaseProbabilities(athletes: Athlete[], marketType: string): number[] {
  const power = marketType === 'PODIUM' ? 0.8 : marketType === 'HIGHEST_SCORE' ? 1.0 : 1.2;
  
  // Sort by world rank (lower = better), then by rating (higher = better)
  const sorted = [...athletes].sort((a, b) => {
    const aRank = a.worldRank ?? Infinity;
    const bRank = b.worldRank ?? Infinity;
    if (aRank !== bRank) return aRank - bRank;
    return (b.rating ?? 0) - (a.rating ?? 0);
  });
  
  // Assign field ranks and calculate raw scores
  const rawScores: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const fieldRank = i + 1;
    rawScores.push(1 / Math.pow(fieldRank, power));
  }
  
  // Return normalized probabilities in original order
  const normalized = normalize(rawScores);
  const rankMap = new Map(sorted.map((a, i) => [a.id, { fieldRank: i + 1, prob: normalized[i] }]));
  
  return athletes.map(a => rankMap.get(a.id)!.prob);
}

// ============================================================
// STEP 2: MONTE CARLO ADJUSTMENT (Light simulations)
// Adds variance based on rating differences
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
// p_final = normalize(W_BASE * p_base + W_MC * p_mc)
// ============================================================
function blendProbabilities(p_base: number[], p_mc: number[]): number[] {
  const blended = p_base.map((pb, i) => W_BASE * pb + W_MC * p_mc[i]);
  return normalize(blended);
}

// ============================================================
// STEP 4: APPLY HOUSE EDGE
// Scale probabilities to hit target implied sum
// ============================================================
function applyHouseEdge(probs: number[], marketType: string): number[] {
  const target = TARGET_IMPLIED_SUM[marketType as keyof typeof TARGET_IMPLIED_SUM] 
    || TARGET_IMPLIED_SUM.WINNER;
  const targetMid = (target.min + target.max) / 2;
  
  // p_adj = p * targetMid (since sum(p) = 1, sum(p_adj) = targetMid)
  return probs.map(p => p * targetMid);
}

// ============================================================
// STEP 5: DERIVE MULTIPLIERS
// M = 1 / p_adj, clamped and rounded
// ============================================================
function deriveMultipliers(p_adj: number[], marketType: string): number[] {
  const caps = MULTIPLIER_CAPS[marketType as keyof typeof MULTIPLIER_CAPS] 
    || MULTIPLIER_CAPS.WINNER;
  
  return p_adj.map(p => {
    if (p <= 0) return caps.max;
    let m = 1 / p;
    m = clamp(m, caps.min, caps.max);
    return roundToLadder(m);
  });
}

// ============================================================
// VALIDATION
// ============================================================
function validate(athletes: AthleteResult[], marketType: string): { passed: boolean; errors: string[] } {
  const errors: string[] = [];
  const sorted = [...athletes].sort((a, b) => a.fieldRank - b.fieldRank);
  
  // Check rank ordering (lower rank should have lower or equal multiplier)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].multiplier < sorted[i - 1].multiplier - 0.01) {
      errors.push(`Rank ${sorted[i].fieldRank} (${sorted[i].multiplier}x) < Rank ${sorted[i - 1].fieldRank} (${sorted[i - 1].multiplier}x)`);
    }
  }
  
  return { passed: errors.length === 0, errors };
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
    const filtered = entries?.filter(e => (e.athletes as any)?.gender === genderFilter) || [];
    
    if (filtered.length < 2) {
      await supabase.from('markets').update({
        odds_validation_status: 'INVALID',
        odds_validation_error: 'Insufficient athletes'
      }).eq('id', market_id);
      return new Response(JSON.stringify({ error: "Insufficient athletes" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build athlete array
    const rankKey = `current_rank_${market.discipline}`;
    const ratingKey = `current_rating_${market.discipline}`;
    
    const athletes: Athlete[] = filtered.map(e => {
      const a = e.athletes as any;
      return {
        id: a.id,
        name: a.name,
        worldRank: e.discipline_rank || a[rankKey] || e.seed_rank,
        rating: e.rating_0_100 || a[ratingKey] || 70,
        manualMultiplier: null  // Not implemented yet
      };
    });

    console.log(`[ODDS] ${athletes.length} athletes`);

    // ========== CORE PIPELINE ==========
    
    // Step 1: Base probabilities from rank formula
    const p_base = calculateBaseProbabilities(athletes, marketType);
    
    // Step 2: Light Monte Carlo adjustment
    const p_mc = runLightMonteCarlo(athletes, marketType);
    
    // Step 3: Blend
    const p_blended = blendProbabilities(p_base, p_mc);
    
    // Step 4: House edge
    const p_adj = applyHouseEdge(p_blended, marketType);
    
    // Step 5: Derive multipliers
    const multipliers = deriveMultipliers(p_adj, marketType);

    // Build results with field ranks
    const sortedForRank = [...athletes].sort((a, b) => {
      const aR = a.worldRank ?? Infinity, bR = b.worldRank ?? Infinity;
      if (aR !== bR) return aR - bR;
      return (b.rating ?? 0) - (a.rating ?? 0);
    });
    const fieldRankMap = new Map(sortedForRank.map((a, i) => [a.id, i + 1]));

    const results: AthleteResult[] = athletes.map((a, i) => ({
      ...a,
      fieldRank: fieldRankMap.get(a.id)!,
      p_base: p_base[i],
      p_mc: p_mc[i],
      p_final: p_blended[i],
      multiplier: a.manualMultiplier && a.manualMultiplier > 0 
        ? roundToLadder(a.manualMultiplier) 
        : multipliers[i]
    }));

    // Validate
    const validation = validate(results, marketType);
    const impliedSum = results.reduce((s, r) => s + (1 / r.multiplier), 0);
    
    console.log(`[ODDS] Implied sum: ${impliedSum.toFixed(4)}, Valid: ${validation.passed}`);

    // Sort for logging
    const sortedResults = [...results].sort((a, b) => a.fieldRank - b.fieldRank);
    console.log('[ODDS] Top 5:');
    sortedResults.slice(0, 5).forEach(r => {
      console.log(`  #${r.fieldRank} ${r.name}: p_base=${(r.p_base*100).toFixed(1)}%, p_mc=${(r.p_mc*100).toFixed(1)}%, p_final=${(r.p_final*100).toFixed(1)}% → ${r.multiplier}x`);
    });

    // Update database using upsert (unique constraint on market_id, athlete_id)
    const validationStatus = validation.passed ? 'VALID' : 'INVALID';
    
    // Upsert selections - uses unique constraint on (market_id, athlete_id)
    for (const r of results) {
      // Upsert selection (selections table only has: id, market_id, athlete_id, description, decimal_odds)
      const { error: selError } = await supabase.from('selections').upsert({
        market_id,
        athlete_id: r.id,
        description: `${r.name} to win`,
        decimal_odds: r.multiplier
      }, { onConflict: 'market_id,athlete_id' });
      
      if (selError) {
        console.error(`[ODDS] Selection upsert error for ${r.name}:`, selError);
      }
      
      await supabase.from('market_odds').upsert({
        market_id,
        athlete_id: r.id,
        multiplier: r.multiplier,
        american_odds: decimalToAmerican(r.multiplier),
        raw_probability: r.p_mc,
        normalized_probability: r.p_final,
        adjusted_probability: 1 / r.multiplier,
        field_rank: r.fieldRank,
        world_rank: r.worldRank,
        rating: r.rating,
        sims_run: SIMS,
        model_version: 'hybrid-v1'
      }, { onConflict: 'market_id,athlete_id' });
    }

    await supabase.from('markets').update({
      odds_validation_status: validationStatus,
      odds_validation_error: validation.passed ? null : validation.errors.join('; '),
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
        model_version: 'hybrid-v1',
        sims: SIMS,
        w_base: W_BASE,
        w_mc: W_MC
      }
    });

    console.log(`[ODDS] ✅ Done`);

    return new Response(JSON.stringify({
      success: true,
      market_id,
      market_type: marketType,
      field_size: results.length,
      implied_sum: impliedSum,
      validation_status: validationStatus,
      model_version: 'hybrid-v1',
      top_athletes: sortedResults.slice(0, 5).map(r => ({
        name: r.name,
        fieldRank: r.fieldRank,
        worldRank: r.worldRank,
        p_base: (r.p_base * 100).toFixed(1) + '%',
        p_mc: (r.p_mc * 100).toFixed(1) + '%',
        p_final: (r.p_final * 100).toFixed(1) + '%',
        multiplier: r.multiplier
      }))
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[ODDS] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
