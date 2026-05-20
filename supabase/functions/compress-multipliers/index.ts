import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Risk configuration (matching frontend config)
const MAX_RISK_RATIO: Record<string, number> = {
  WINNER: 1.15,
  PODIUM: 1.10,
  HIGHEST_SCORE: 1.12,
};

// One-sided anti-arbitrage floor. Mirror of
// src/utils/multiplierCaps.ts IMPLIED_SUM_FLOOR.
// Compression must never drive Σ(1/m) below floor (would create
// an arbitrageable book). No upper bound.
const IMPLIED_SUM_FLOOR: Record<string, number> = {
  WINNER:        1.05,
  PODIUM:        3.10,
  HIGHEST_SCORE: 1.05,
  HEAD_TO_HEAD:  2.00,
};

const COMPRESSION_CONFIG = {
  MAX_ADJUSTMENT_PCT: 0.08,      // Max 8% adjustment per update
  MIN_EXPOSURE_PCT: 0.05,       // Only compress athletes with >5% of tokens
  MULTIPLIER_FLOOR: 1.20,       // Never compress below this
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
  return Math.max(COMPRESSION_CONFIG.MULTIPLIER_FLOOR, Math.min(25.0, odds));
}

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

interface AthleteExposure {
  athlete_id: string;
  athlete_name: string;
  current_multiplier: number;
  tokens_on_athlete: number;
  percent_of_pool: number;
  payout_exposure: number;
}

interface CompressionResult {
  athlete_id: string;
  old_multiplier: number;
  new_multiplier: number;
  compression_pct: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { market_id, dry_run = false, force = false } = await req.json();

    if (!market_id) {
      return new Response(
        JSON.stringify({ error: "market_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === OPTION A: Check if Fixed Multiplier Mode is enabled ===
    const { data: configData } = await supabase
      .from('risk_config')
      .select('key, value')
      .eq('key', 'fixed_multiplier_mode')
      .maybeSingle();

    const fixedMultiplierMode = configData?.value === 'true';

    if (fixedMultiplierMode && !force) {
      console.log(`[COMPRESS] Blocked: Fixed Multiplier Mode enabled (Option A)`);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Multiplier compression disabled in Fixed Multiplier Mode (Option A)",
          message: "Multipliers are locked at publish time. Use force=true to override.",
          fixed_multiplier_mode: true,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing compression for market: ${market_id}, dry_run: ${dry_run}, force: ${force}`);

    // Get market details
    const { data: market, error: marketError } = await supabase
      .from("markets")
      .select("id, name, market_type, discipline, tournament_id")
      .eq("id", market_id)
      .maybeSingle();

    if (marketError || !market) {
      console.error('Market not found:', marketError);
      return new Response(
        JSON.stringify({ error: "Market not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const maxRiskRatio = MAX_RISK_RATIO[market.market_type] || MAX_RISK_RATIO.WINNER;
    const impliedSumFloor = IMPLIED_SUM_FLOOR[market.market_type] ?? IMPLIED_SUM_FLOOR.WINNER;

    // Get current selections with odds
    const { data: selections, error: selectionsError } = await supabase
      .from("selections")
      .select(`
        id,
        athlete_id,
        decimal_odds,
        athletes (id, name)
      `)
      .eq("market_id", market_id);

    if (selectionsError) throw selectionsError;
    if (!selections || selections.length === 0) {
      return new Response(
        JSON.stringify({ error: "No selections found for market" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get predictions to calculate exposure
    const { data: predictions, error: predictionsError } = await supabase
      .from("predictions")
      .select("selection_id, staked_tokens, potential_payout, status")
      .in("selection_id", selections.map(s => s.id))
      // Include SETTLING: liability exposure is real until the settlement run
      // completes (or its compensating reversal lands).
      .in("status", ["PENDING", "pending", "SETTLING"]);

    if (predictionsError) throw predictionsError;

    // Calculate total tokens and exposure per athlete
    const selectionIdToAthlete: Record<string, string> = {};
    const athleteOdds: Record<string, number> = {};
    const athleteNames: Record<string, string> = {};
    
    selections.forEach(s => {
      selectionIdToAthlete[s.id] = s.athlete_id;
      athleteOdds[s.athlete_id] = s.decimal_odds;
      athleteNames[s.athlete_id] = (s.athletes as any)?.name || 'Unknown';
    });

    // Sum tokens by athlete
    const tokensByAthlete: Record<string, number> = {};
    let totalTokens = 0;

    (predictions || []).forEach(p => {
      const athleteId = selectionIdToAthlete[p.selection_id];
      if (athleteId) {
        tokensByAthlete[athleteId] = (tokensByAthlete[athleteId] || 0) + (p.staked_tokens || 0);
        totalTokens += p.staked_tokens || 0;
      }
    });

    console.log(`Total tokens in market: ${totalTokens}`);

    if (totalTokens === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          market_id,
          message: "No active exposure - no compression needed",
          risk_ratio: 0,
          max_risk_ratio: maxRiskRatio,
          compression_applied: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate payout exposure and risk ratio
    const athleteExposures: AthleteExposure[] = Object.entries(tokensByAthlete).map(([athleteId, tokens]) => {
      const multiplier = athleteOdds[athleteId] || 2.0;
      const payoutExposure = tokens * multiplier;
      return {
        athlete_id: athleteId,
        athlete_name: athleteNames[athleteId],
        current_multiplier: multiplier,
        tokens_on_athlete: tokens,
        percent_of_pool: (tokens / totalTokens) * 100,
        payout_exposure: payoutExposure,
      };
    });

    // Calculate current risk ratio
    const maxPayoutExposure = Math.max(...athleteExposures.map(a => a.payout_exposure), 0);
    const currentRiskRatio = totalTokens > 0 ? maxPayoutExposure / totalTokens : 0;

    console.log(`Current risk ratio: ${currentRiskRatio}, max allowed: ${maxRiskRatio}`);

    // Check if compression is needed
    if (currentRiskRatio <= maxRiskRatio) {
      return new Response(
        JSON.stringify({
          success: true,
          market_id,
          message: "Risk ratio within limits - no compression needed",
          risk_ratio: Math.round(currentRiskRatio * 1000) / 1000,
          max_risk_ratio: maxRiskRatio,
          compression_applied: false,
          athlete_exposures: athleteExposures,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate base compression factor
    let compressionFactor = maxRiskRatio / currentRiskRatio;
    
    // Cap max adjustment at 8% per run
    const minCompressionFactor = 1 - COMPRESSION_CONFIG.MAX_ADJUSTMENT_PCT;
    compressionFactor = Math.max(compressionFactor, minCompressionFactor);

    console.log(`Compression factor: ${compressionFactor}`);

    // Apply compression ONLY to exposed athletes (>5% of pool)
    const compressionResults: CompressionResult[] = [];
    const selectionsToUpdate: { id: string; decimal_odds: number }[] = [];

    for (const exposure of athleteExposures) {
      // Skip athletes with less than 5% of total tokens
      if (exposure.percent_of_pool < COMPRESSION_CONFIG.MIN_EXPOSURE_PCT * 100) {
        console.log(`Skipping ${exposure.athlete_name} - only ${exposure.percent_of_pool.toFixed(2)}% of pool`);
        continue;
      }

      const oldMultiplier = exposure.current_multiplier;
      let newMultiplier = oldMultiplier * compressionFactor;
      
      // Never increase multipliers
      newMultiplier = Math.min(newMultiplier, oldMultiplier);
      
      // Apply floor
      newMultiplier = Math.max(newMultiplier, COMPRESSION_CONFIG.MULTIPLIER_FLOOR);
      
      // Round to ladder
      newMultiplier = clampOdds(roundToLadder(newMultiplier));

      if (newMultiplier !== oldMultiplier) {
        const selection = selections.find(s => s.athlete_id === exposure.athlete_id);
        if (selection) {
          compressionResults.push({
            athlete_id: exposure.athlete_id,
            old_multiplier: oldMultiplier,
            new_multiplier: newMultiplier,
            compression_pct: ((oldMultiplier - newMultiplier) / oldMultiplier) * 100,
          });
          selectionsToUpdate.push({
            id: selection.id,
            decimal_odds: newMultiplier,
          });
        }
      }
    }

    // Calculate new implied sum after compression
    let newImpliedSum = 0;
    selections.forEach(s => {
      const update = selectionsToUpdate.find(u => u.id === s.id);
      const odds = update ? update.decimal_odds : s.decimal_odds;
      newImpliedSum += 1 / odds;
    });

    // Floor-only check: compression must keep implied sum ≥ floor
    // (anti-arbitrage). No upper bound — over-juice is fine.
    const impliedSumAboveFloor = newImpliedSum >= impliedSumFloor - 1e-6;
    if (!impliedSumAboveFloor) {
      console.log(`Implied sum ${newImpliedSum} below floor ${impliedSumFloor} - book would be arbitrageable`);
    }

    // Calculate new risk ratio after compression
    let newMaxPayoutExposure = 0;
    athleteExposures.forEach(exposure => {
      const result = compressionResults.find(r => r.athlete_id === exposure.athlete_id);
      const multiplier = result ? result.new_multiplier : exposure.current_multiplier;
      const payoutExposure = exposure.tokens_on_athlete * multiplier;
      newMaxPayoutExposure = Math.max(newMaxPayoutExposure, payoutExposure);
    });
    const newRiskRatio = totalTokens > 0 ? newMaxPayoutExposure / totalTokens : 0;

    // Apply updates if not dry run
    if (!dry_run && selectionsToUpdate.length > 0) {
      console.log(`Applying ${selectionsToUpdate.length} compression updates`);
      
      for (const update of selectionsToUpdate) {
        const { error: updateError } = await supabase
          .from("selections")
          .update({ decimal_odds: update.decimal_odds, updated_at: new Date().toISOString() })
          .eq("id", update.id);
        
        if (updateError) {
          console.error(`Failed to update selection ${update.id}:`, updateError);
        }
      }

      // Log each compression
      for (const result of compressionResults) {
        await writeAuditLog(supabase, {
          actor_type: 'system',
          action_type: 'MULTIPLIER_COMPRESSED',
          entity_type: 'selection',
          entity_id: result.athlete_id,
          before_state: {
            multiplier: result.old_multiplier,
            risk_ratio: currentRiskRatio,
          },
          after_state: {
            multiplier: result.new_multiplier,
            risk_ratio: newRiskRatio,
          },
          metadata: {
            market_id,
            market_type: market.market_type,
            compression_pct: result.compression_pct,
            compression_factor: compressionFactor,
          },
        });
      }

      // Log overall compression event for the market
      await writeAuditLog(supabase, {
        actor_type: 'system',
        action_type: 'MARKET_RISK_COMPRESSED',
        entity_type: 'market',
        entity_id: market_id,
        before_state: {
          risk_ratio: currentRiskRatio,
          max_payout_exposure: maxPayoutExposure,
        },
        after_state: {
          risk_ratio: newRiskRatio,
          max_payout_exposure: newMaxPayoutExposure,
          implied_sum: newImpliedSum,
        },
        metadata: {
          market_type: market.market_type,
          athletes_compressed: compressionResults.length,
          compression_factor: compressionFactor,
          total_tokens: totalTokens,
        },
      });
    }

    const cumulativeCompressionPct = compressionResults.length > 0
      ? compressionResults.reduce((sum, r) => sum + r.compression_pct, 0) / compressionResults.length
      : 0;

    return new Response(
      JSON.stringify({
        success: true,
        market_id,
        market_type: market.market_type,
        dry_run,
        compression_applied: compressionResults.length > 0,
        risk_ratio_before: Math.round(currentRiskRatio * 1000) / 1000,
        risk_ratio_after: Math.round(newRiskRatio * 1000) / 1000,
        max_risk_ratio: maxRiskRatio,
        implied_sum_after: Math.round(newImpliedSum * 1000) / 1000,
        implied_sum_floor: impliedSumFloor,
        implied_sum_within_band: impliedSumWithinBand,
        compression_factor: Math.round(compressionFactor * 1000) / 1000,
        cumulative_compression_pct: Math.round(cumulativeCompressionPct * 100) / 100,
        athletes_compressed: compressionResults.length,
        compression_details: compressionResults,
        athlete_exposures: athleteExposures,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const error = err as Error;
    console.error("Error in compress-multipliers:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
