import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================
// MARKET CONFIGURATION - Deterministic Rank-Based Pricing
// ============================================================
const MARKET_CONFIG = {
  WINNER: {
    formula: { A: 3, B: 12, gamma: 1.8 },
    buckets: [
      { maxRank: 3, min: 3.0, max: 6.0 },
      { maxRank: 10, min: 6.0, max: 10.0 },
      { maxRank: Infinity, min: 10.0, max: 15.0 }
    ],
    targetImpliedSum: { min: 0.90, max: 0.915 }
  },
  PODIUM: {
    formula: { A: 1.25, B: 6.75, gamma: 1.6 },
    buckets: [
      { maxRank: 3, min: 1.25, max: 3.0 },
      { maxRank: 10, min: 3.0, max: 5.5 },
      { maxRank: Infinity, min: 5.5, max: 8.0 }
    ],
    targetImpliedSum: { min: 0.84, max: 0.86 }
  },
  HIGHEST_SCORE: {
    formula: { A: 4, B: 8, gamma: 1.7 },
    buckets: [
      { maxRank: 3, min: 4.0, max: 6.5 },
      { maxRank: 10, min: 6.5, max: 9.5 },
      { maxRank: Infinity, min: 9.5, max: 12.0 }
    ],
    targetImpliedSum: { min: 0.87, max: 0.89 }
  }
} as const;

type MarketType = keyof typeof MARKET_CONFIG;

// Odds ladder for rounding
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
// UTILITY FUNCTIONS
// ============================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundToLadder(value: number): number {
  if (value <= ODDS_LADDER[0]) return ODDS_LADDER[0];
  if (value >= ODDS_LADDER[ODDS_LADDER.length - 1]) return ODDS_LADDER[ODDS_LADDER.length - 1];
  
  let closest = ODDS_LADDER[0];
  let minDiff = Math.abs(value - closest);
  
  for (const ladder of ODDS_LADDER) {
    const diff = Math.abs(value - ladder);
    if (diff < minDiff) {
      minDiff = diff;
      closest = ladder;
    }
  }
  
  return closest;
}

function decimalToAmerican(decimal: number): number {
  if (decimal >= 2.0) {
    return Math.round((decimal - 1) * 100);
  } else {
    return Math.round(-100 / (decimal - 1));
  }
}

// ============================================================
// ATHLETE TYPES
// ============================================================

interface AthleteInput {
  id: string;
  name: string;
  worldRank: number | null;
  rating: number | null;
  selectionId?: string;
  manualMultiplier?: number | null;
}

interface AthleteWithFieldRank extends AthleteInput {
  fieldRank: number;
  effectiveRank: number;
}

interface AthleteWithMultiplier extends AthleteWithFieldRank {
  M_base: number;
  multiplier: number;
  impliedProbability: number;
}

// ============================================================
// CORE PRICING FUNCTIONS
// ============================================================

/**
 * Assign field ranks based on world rank (or rating if unranked)
 * RULE: Every athlete MUST have a rank - no uniform fallback
 */
function assignFieldRanks(athletes: AthleteInput[]): AthleteWithFieldRank[] {
  // Sort: world-ranked first (by rank ASC), then unranked by rating DESC
  const sorted = [...athletes].sort((a, b) => {
    const aRank = a.worldRank ?? Infinity;
    const bRank = b.worldRank ?? Infinity;
    
    if (aRank !== bRank) return aRank - bRank;
    
    // Tie-break by rating (higher is better)
    return (b.rating ?? 0) - (a.rating ?? 0);
  });
  
  // Assign field ranks 1, 2, 3...
  return sorted.map((athlete, index) => ({
    ...athlete,
    fieldRank: index + 1,
    effectiveRank: athlete.worldRank ?? (1000 + index) // For audit: unranked get high synthetic ranks
  }));
}

/**
 * Calculate base multiplier using the rank-based formula
 * M_base = A + B * (t^γ) where t = (r-1)/(N-1)
 */
function calculateBaseMultiplier(
  fieldRank: number,
  fieldSize: number,
  marketType: MarketType
): { M_base: number; multiplier: number } {
  const config = MARKET_CONFIG[marketType];
  const { A, B, gamma } = config.formula;
  
  // Normalized rank: t ∈ [0, 1]
  const t = fieldSize > 1 ? (fieldRank - 1) / (fieldSize - 1) : 0;
  
  // Base multiplier from curve
  const M_base = A + B * Math.pow(t, gamma);
  
  // Find appropriate bucket and clamp
  let multiplier = M_base;
  for (const bucket of config.buckets) {
    if (fieldRank <= bucket.maxRank) {
      multiplier = clamp(M_base, bucket.min, bucket.max);
      break;
    }
  }
  
  return { M_base, multiplier };
}

/**
 * Calculate multipliers for all athletes
 */
function calculateMultipliers(
  athletes: AthleteWithFieldRank[],
  marketType: MarketType
): AthleteWithMultiplier[] {
  const fieldSize = athletes.length;
  
  return athletes.map(athlete => {
    // Use manual multiplier if set
    if (athlete.manualMultiplier && athlete.manualMultiplier > 0) {
      const multiplier = roundToLadder(athlete.manualMultiplier);
      return {
        ...athlete,
        M_base: athlete.manualMultiplier,
        multiplier,
        impliedProbability: 1 / multiplier
      };
    }
    
    const { M_base, multiplier } = calculateBaseMultiplier(
      athlete.fieldRank,
      fieldSize,
      marketType
    );
    
    return {
      ...athlete,
      M_base,
      multiplier: roundToLadder(multiplier),
      impliedProbability: 1 / roundToLadder(multiplier)
    };
  });
}

/**
 * Apply house edge by scaling to target implied sum
 * For large fields, bucket maxes are scaled up proportionally
 */
function applyHouseEdge(
  athletes: AthleteWithMultiplier[],
  marketType: MarketType
): AthleteWithMultiplier[] {
  const config = MARKET_CONFIG[marketType];
  const targetMid = (config.targetImpliedSum.min + config.targetImpliedSum.max) / 2;
  const fieldSize = athletes.length;
  
  // Calculate current implied sum
  const currentSum = athletes.reduce((sum, a) => sum + (1 / a.multiplier), 0);
  
  console.log(`[HOUSE-EDGE] Current sum: ${currentSum.toFixed(4)}, Target: ${targetMid.toFixed(4)}, Field: ${fieldSize}`);
  
  if (Math.abs(currentSum - targetMid) < 0.01) {
    return athletes;
  }
  
  // Scale probabilities to hit target
  const scaleFactor = targetMid / currentSum;
  
  // For large fields, scale bucket maxes proportionally
  const bucketScaler = fieldSize > 8 ? fieldSize / 8 : 1;
  
  return athletes.map(a => {
    const p = 1 / a.multiplier;
    const p_adj = p * scaleFactor;
    let M_final = 1 / p_adj;
    
    // Get bucket with scaled max for large fields
    const baseBucket = config.buckets.find(b => a.fieldRank <= b.maxRank) 
      || config.buckets[config.buckets.length - 1];
    
    const scaledMax = Math.min(baseBucket.max * bucketScaler, 15.0);
    M_final = clamp(M_final, baseBucket.min, scaledMax);
    M_final = roundToLadder(M_final);
    
    return {
      ...a,
      multiplier: M_final,
      impliedProbability: 1 / M_final
    };
  });
}

// ============================================================
// VALIDATION - FAIL-FAST ASSERTIONS
// ============================================================

interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

function validateBeforePublish(
  athletes: AthleteWithMultiplier[],
  marketType: MarketType
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const config = MARKET_CONFIG[marketType];
  
  // Sort by field rank for validation
  const sorted = [...athletes].sort((a, b) => a.fieldRank - b.fieldRank);
  
  // 1. Rank ordering preserved (lower rank = lower multiplier)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].multiplier < sorted[i - 1].multiplier) {
      errors.push(`Rank ${sorted[i].fieldRank} (${sorted[i].multiplier}x) < Rank ${sorted[i - 1].fieldRank} (${sorted[i - 1].multiplier}x)`);
    }
  }
  
  // 2. No identical multipliers for top 5 adjacent ranks (unless many athletes)
  if (athletes.length <= 10) {
    for (let i = 1; i < Math.min(5, sorted.length); i++) {
      if (sorted[i].multiplier === sorted[i - 1].multiplier && !sorted[i].manualMultiplier && !sorted[i - 1].manualMultiplier) {
        warnings.push(`Ranks ${sorted[i - 1].fieldRank} and ${sorted[i].fieldRank} have identical multipliers (${sorted[i].multiplier}x)`);
      }
    }
  }
  
  // 3. All multipliers within bucket caps
  for (const athlete of sorted) {
    const bucket = config.buckets.find(b => athlete.fieldRank <= b.maxRank)!;
    if (athlete.multiplier < bucket.min - 0.01 || athlete.multiplier > bucket.max + 0.01) {
      warnings.push(`Rank ${athlete.fieldRank} multiplier ${athlete.multiplier}x outside bucket [${bucket.min}, ${bucket.max}]`);
    }
  }
  
  // 4. Implied sum within target band (with tolerance)
  const impliedSum = sorted.reduce((s, a) => s + (1 / a.multiplier), 0);
  const tolerance = 0.05; // 5% tolerance
  if (impliedSum < config.targetImpliedSum.min - tolerance || impliedSum > config.targetImpliedSum.max + tolerance) {
    warnings.push(`Implied sum ${impliedSum.toFixed(4)} outside band [${config.targetImpliedSum.min}, ${config.targetImpliedSum.max}]`);
  }
  
  // 5. Top athlete must have the lowest multiplier
  if (sorted.length > 0 && sorted[0].fieldRank === 1) {
    const minMultiplier = Math.min(...sorted.map(a => a.multiplier));
    if (sorted[0].multiplier > minMultiplier) {
      errors.push(`Rank 1 (${sorted[0].multiplier}x) does not have lowest multiplier (min is ${minMultiplier}x)`);
    }
  }
  
  return {
    passed: errors.length === 0,
    errors,
    warnings
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
        JSON.stringify({ error: "market_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ODDS-ENGINE] Processing market ${market_id}, force=${force}`);

    // ========================================
    // 1. FETCH MARKET DATA
    // ========================================
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('*, tournaments!inner(id, name, start_datetime)')
      .eq('id', market_id)
      .single();

    if (marketError || !market) {
      console.error('[ODDS-ENGINE] Market not found:', marketError);
      return new Response(
        JSON.stringify({ error: "Market not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const marketType = (market.market_type?.toUpperCase() || 'WINNER') as MarketType;
    if (!MARKET_CONFIG[marketType]) {
      return new Response(
        JSON.stringify({ error: `Unsupported market type: ${marketType}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ODDS-ENGINE] Market: ${market.name}, Type: ${marketType}, Discipline: ${market.discipline}, Category: ${market.category}`);

    // ========================================
    // 2. FETCH ATHLETES FROM TOURNAMENT ENTRIES
    // ========================================
    const { data: entries, error: entriesError } = await supabase
      .from('tournament_entries')
      .select(`
        id,
        athlete_id,
        discipline_rank,
        seed_rank,
        rating_0_100,
        athletes!inner(id, name, gender, current_rank_slalom, current_rank_trick, current_rank_jump, current_rating_slalom, current_rating_trick, current_rating_jump)
      `)
      .eq('tournament_id', market.tournament_id)
      .eq('discipline', market.discipline);

    if (entriesError) {
      console.error('[ODDS-ENGINE] Failed to fetch entries:', entriesError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch tournament entries" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter by gender
    const genderFilter = market.category === 'open_men' ? 'male' : 'female';
    const filteredEntries = entries?.filter(e => {
      const athlete = e.athletes as any;
      return athlete?.gender === genderFilter;
    }) || [];

    console.log(`[ODDS-ENGINE] Found ${filteredEntries.length} athletes for ${genderFilter} ${market.discipline}`);

    if (filteredEntries.length < 2) {
      await supabase.from('markets').update({
        odds_validation_status: 'INVALID',
        odds_validation_error: 'Insufficient athletes (need at least 2)'
      }).eq('id', market_id);
      
      return new Response(
        JSON.stringify({ error: "Insufficient athletes", count: filteredEntries.length }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================
    // 3. FETCH EXISTING SELECTIONS & MANUAL MULTIPLIERS
    // ========================================
    const { data: existingSelections } = await supabase
      .from('selections')
      .select('id, athlete_id, manual_multiplier')
      .eq('market_id', market_id);

    const selectionMap = new Map(existingSelections?.map(s => [s.athlete_id, s]) || []);

    // ========================================
    // 4. BUILD ATHLETE INPUT ARRAY
    // ========================================
    const athleteInputs: AthleteInput[] = filteredEntries.map(entry => {
      const athlete = entry.athletes as any;
      const selection = selectionMap.get(athlete.id);
      
      // Priority: discipline_rank > athlete world rank > seed_rank
      const disciplineRankKey = `current_rank_${market.discipline}`;
      const disciplineRatingKey = `current_rating_${market.discipline}`;
      
      const worldRank = entry.discipline_rank 
        || athlete[disciplineRankKey]
        || entry.seed_rank;
      
      // Priority: cached rating > athlete rating
      const rating = entry.rating_0_100 
        || athlete[disciplineRatingKey]
        || 70; // Default rating
      
      return {
        id: athlete.id,
        name: athlete.name,
        worldRank,
        rating,
        selectionId: selection?.id,
        manualMultiplier: selection?.manual_multiplier
      };
    });

    // ========================================
    // 5. FAIL-FAST: Check for athletes missing both rank AND rating
    // ========================================
    const invalidAthletes = athleteInputs.filter(a => !a.worldRank && !a.rating);
    if (invalidAthletes.length > 0) {
      const names = invalidAthletes.map(a => a.name).join(', ');
      await supabase.from('markets').update({
        odds_validation_status: 'INVALID',
        odds_validation_error: `Athletes missing rank and rating: ${names}`
      }).eq('id', market_id);
      
      return new Response(
        JSON.stringify({ error: `BLOCKED: Athletes missing rank and rating: ${names}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================
    // 6. ASSIGN FIELD RANKS
    // ========================================
    const rankedAthletes = assignFieldRanks(athleteInputs);
    
    console.log('[ODDS-ENGINE] Field rankings:');
    rankedAthletes.slice(0, 5).forEach(a => {
      console.log(`  Field #${a.fieldRank}: ${a.name} (World Rank: ${a.worldRank || 'unranked'}, Rating: ${a.rating})`);
    });

    // ========================================
    // 7. CALCULATE BASE MULTIPLIERS
    // ========================================
    const withMultipliers = calculateMultipliers(rankedAthletes, marketType);

    // ========================================
    // 8. APPLY HOUSE EDGE
    // ========================================
    const finalAthletes = applyHouseEdge(withMultipliers, marketType);

    // ========================================
    // 9. VALIDATE BEFORE PUBLISH
    // ========================================
    const validation = validateBeforePublish(finalAthletes, marketType);
    
    const impliedSum = finalAthletes.reduce((s, a) => s + (1 / a.multiplier), 0);
    
    console.log(`[ODDS-ENGINE] Validation: passed=${validation.passed}, impliedSum=${impliedSum.toFixed(4)}`);
    if (validation.errors.length > 0) {
      console.error('[ODDS-ENGINE] Errors:', validation.errors);
    }
    if (validation.warnings.length > 0) {
      console.warn('[ODDS-ENGINE] Warnings:', validation.warnings);
    }

    // Log final odds for top 5
    console.log('[ODDS-ENGINE] Final multipliers:');
    finalAthletes.slice(0, 5).forEach(a => {
      console.log(`  Field #${a.fieldRank}: ${a.name} = ${a.multiplier}x (M_base: ${a.M_base.toFixed(2)})`);
    });

    // ========================================
    // 10. DETERMINE VALIDATION STATUS
    // ========================================
    let validationStatus = validation.passed ? 'VALID' : 'INVALID';
    let validationError = validation.passed ? null : validation.errors.join('; ');

    if (!validation.passed && !force) {
      // Update market status but DO NOT sync selections
      await supabase.from('markets').update({
        odds_validation_status: validationStatus,
        odds_validation_error: validationError,
        odds_generated_at: new Date().toISOString()
      }).eq('id', market_id);
      
      return new Response(
        JSON.stringify({
          success: false,
          error: `BLOCKED: ${validationError}`,
          validation,
          impliedSum,
          athletes: finalAthletes.slice(0, 10).map(a => ({
            name: a.name,
            fieldRank: a.fieldRank,
            M_base: a.M_base,
            multiplier: a.multiplier
          }))
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================
    // 11. SYNC TO DATABASE
    // ========================================
    
    // Update or create selections
    for (const athlete of finalAthletes) {
      const americanOdds = decimalToAmerican(athlete.multiplier);
      
      if (athlete.selectionId) {
        // Update existing selection
        await supabase
          .from('selections')
          .update({
            decimal_odds: athlete.multiplier,
            american_odds: americanOdds,
            updated_at: new Date().toISOString()
          })
          .eq('id', athlete.selectionId);
      } else {
        // Create new selection
        await supabase
          .from('selections')
          .insert({
            market_id,
            athlete_id: athlete.id,
            description: `${athlete.name} to win`,
            decimal_odds: athlete.multiplier,
            american_odds: americanOdds
          });
      }
    }

    // Upsert market_odds for audit trail
    const marketOddsRecords = finalAthletes.map(a => ({
      market_id,
      athlete_id: a.id,
      multiplier: a.multiplier,
      american_odds: decimalToAmerican(a.multiplier),
      raw_probability: 1 / a.M_base,
      normalized_probability: a.impliedProbability,
      adjusted_probability: a.impliedProbability,
      field_rank: a.fieldRank,
      world_rank: a.worldRank,
      rating: a.rating,
      sims_run: 0, // Deterministic - no simulations
      model_version: 'deterministic-rank-v1'
    }));

    for (const record of marketOddsRecords) {
      await supabase
        .from('market_odds')
        .upsert(record, { onConflict: 'market_id,athlete_id' });
    }

    // Update market status
    await supabase.from('markets').update({
      odds_validation_status: validationStatus,
      odds_validation_error: validationError,
      odds_generated_at: new Date().toISOString(),
      implied_sum: impliedSum
    }).eq('id', market_id);

    // ========================================
    // 12. WRITE AUDIT LOG
    // ========================================
    await supabase.from('audit_logs').insert({
      event_type: 'odds_generated',
      target_type: 'market',
      target_id: market_id,
      payload: {
        market_type: marketType,
        field_size: finalAthletes.length,
        implied_sum: impliedSum,
        validation_status: validationStatus,
        model_version: 'deterministic-rank-v1',
        top_5: finalAthletes.slice(0, 5).map(a => ({
          name: a.name,
          fieldRank: a.fieldRank,
          worldRank: a.worldRank,
          M_base: a.M_base,
          multiplier: a.multiplier
        }))
      }
    });

    console.log(`[ODDS-ENGINE] ✅ Market ${market_id} processed successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        market_id,
        market_type: marketType,
        field_size: finalAthletes.length,
        implied_sum: impliedSum,
        validation_status: validationStatus,
        warnings: validation.warnings,
        model_version: 'deterministic-rank-v1',
        top_athletes: finalAthletes.slice(0, 5).map(a => ({
          name: a.name,
          fieldRank: a.fieldRank,
          worldRank: a.worldRank,
          M_base: a.M_base,
          multiplier: a.multiplier
        }))
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const error = err as Error;
    console.error("[ODDS-ENGINE] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
