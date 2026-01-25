import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Audit log helper
async function writeAuditLog(supabase: any, entry: {
  actor_type: 'admin' | 'system';
  actor_id?: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  before_state?: any;
  after_state?: any;
  metadata?: Record<string, any>;
}): Promise<void> {
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

interface ValidateBetRequest {
  userId: string;
  tournamentId: string;
  marketId: string;
  athleteId: string;
  stakeAmount: number;
  currentOdds: number;
  marketType: 'WINNER' | 'PODIUM' | 'HIGHEST_SCORE';
}

interface ValidationResult {
  allowed: boolean;
  reason?: string;
  warnings: string[];
  exposureInfo?: {
    athleteName: string;
    currentExposurePct: number;
    maxExposurePct: number;
    remainingCapacity: number;
    isAtCapacity: boolean;
  };
}

// Risk config defaults - Option A: Fixed Multipliers with Hard Caps
const DEFAULT_CONFIG = {
  max_stake_tokens: 10000,
  max_payout_tokens: 150000,
  max_athlete_exposure_pct: 0.30,       // 30% hard cap
  max_athlete_allocation_pct: 0.25,     // 25% user allocation limit
  fixed_multiplier_mode: true,          // Option A enabled
  allow_live_odds_adjustment: false,    // No odds shortening
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: ValidateBetRequest = await req.json();
    const { userId, tournamentId, marketId, athleteId, stakeAmount, currentOdds, marketType } = body;

    const result: ValidationResult = {
      allowed: true,
      warnings: [],
    };

    // Fetch risk config from database
    const { data: configData } = await supabase
      .from('risk_config')
      .select('key, value');
    
    const config = { ...DEFAULT_CONFIG };
    if (configData) {
      for (const row of configData) {
        const key = row.key as string;
        const val = row.value as string;
        
        // Parse boolean values
        if (val === 'true') {
          (config as any)[key] = true;
        } else if (val === 'false') {
          (config as any)[key] = false;
        } else {
          const numVal = parseFloat(val);
          if (!isNaN(numVal)) {
            (config as any)[key] = numVal;
          }
        }
      }
    }

    console.log(`[VALIDATE] Option A Mode: ${config.fixed_multiplier_mode}, Allow Live Adjustment: ${config.allow_live_odds_adjustment}`);

    // === VALIDATION 1: Stake Cap ===
    if (stakeAmount > config.max_stake_tokens) {
      return new Response(JSON.stringify({
        allowed: false,
        reason: `Maximum stake is ${config.max_stake_tokens.toLocaleString()} tokens`,
        warnings: [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === VALIDATION 2: Payout Cap ===
    const potentialPayout = stakeAmount * currentOdds;
    if (potentialPayout > config.max_payout_tokens) {
      return new Response(JSON.stringify({
        allowed: false,
        reason: `Maximum payout is ${config.max_payout_tokens.toLocaleString()} tokens. Reduce stake or pick different odds.`,
        warnings: [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === VALIDATION 3: Duplicate Athlete Check (same user, same market) ===
    const { data: existingBets } = await supabase
      .from('bet_slips')
      .select('id')
      .eq('user_id', userId)
      .eq('market_id', marketId)
      .eq('athlete_id', athleteId)
      .eq('status', 'PENDING');

    if (existingBets && existingBets.length > 0) {
      return new Response(JSON.stringify({
        allowed: false,
        reason: 'You already have an active bet on this athlete in this market',
        warnings: [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === VALIDATION 4: 25% User Allocation Limit ===
    const { data: userTournamentBets } = await supabase
      .from('bet_slips')
      .select('total_stake_tokens, athlete_id')
      .eq('user_id', userId)
      .eq('tournament_id', tournamentId)
      .eq('status', 'PENDING');

    if (userTournamentBets && userTournamentBets.length > 0) {
      const totalTournamentStake = userTournamentBets.reduce((sum, b) => sum + (b.total_stake_tokens || 0), 0) + stakeAmount;
      const athleteStake = userTournamentBets
        .filter(b => b.athlete_id === athleteId)
        .reduce((sum, b) => sum + (b.total_stake_tokens || 0), 0) + stakeAmount;
      
      const allocationPct = athleteStake / totalTournamentStake;
      
      if (allocationPct > config.max_athlete_allocation_pct) {
        return new Response(JSON.stringify({
          allowed: false,
          reason: `Cannot allocate more than ${Math.round(config.max_athlete_allocation_pct * 100)}% of your tournament stake to one athlete`,
          warnings: [],
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // === VALIDATION 5: OPTION A - Hard Exposure Cap (30% of market pool) ===
    // Get current liability for this athlete in this market
    const { data: liability } = await supabase
      .from('market_liability')
      .select('*')
      .eq('market_id', marketId)
      .eq('athlete_id', athleteId)
      .maybeSingle();

    // Get total market handle (all bets on this market)
    const { data: allMarketLiability } = await supabase
      .from('market_liability')
      .select('total_stake_tokens')
      .eq('market_id', marketId);

    const currentMarketHandle = (allMarketLiability || []).reduce((sum, l) => sum + (l.total_stake_tokens || 0), 0);
    const newMarketHandle = currentMarketHandle + stakeAmount;
    
    const currentAthleteTokens = liability?.total_stake_tokens || 0;
    const newAthleteTokens = currentAthleteTokens + stakeAmount;

    // Calculate max allowed tokens for this athlete (30% of new market total)
    const maxAthleteTokens = newMarketHandle * config.max_athlete_exposure_pct;
    
    // Get athlete name for display
    const { data: athleteData } = await supabase
      .from('athletes')
      .select('name')
      .eq('id', athleteId)
      .single();

    const athleteName = athleteData?.name || 'Unknown';

    // Calculate exposure percentages
    const currentExposurePct = currentMarketHandle > 0 
      ? (currentAthleteTokens / currentMarketHandle) * 100 
      : 0;
    const newExposurePct = newMarketHandle > 0 
      ? (newAthleteTokens / newMarketHandle) * 100 
      : 0;
    const remainingCapacity = Math.max(0, Math.floor(maxAthleteTokens - currentAthleteTokens));

    // OPTION A: Hard block if exposure would exceed 30% cap
    if (newAthleteTokens > maxAthleteTokens) {
      console.log(`[VALIDATE] BLOCKED: ${athleteName} would exceed ${config.max_athlete_exposure_pct * 100}% cap (${newExposurePct.toFixed(1)}%)`);
      
      // Write audit log for blocked bet
      await writeAuditLog(supabase, {
        actor_type: 'system',
        action_type: 'BET_BLOCKED_EXPOSURE_CAP',
        entity_type: 'bet_validation',
        entity_id: `${marketId}_${athleteId}`,
        before_state: {
          current_exposure_pct: currentExposurePct,
          current_athlete_tokens: currentAthleteTokens,
        },
        after_state: {
          attempted_exposure_pct: newExposurePct,
          attempted_athlete_tokens: newAthleteTokens,
          max_allowed_tokens: maxAthleteTokens,
        },
        metadata: {
          user_id: userId,
          stake_amount: stakeAmount,
          market_id: marketId,
          athlete_name: athleteName,
          exposure_cap_pct: config.max_athlete_exposure_pct * 100,
          remaining_capacity: remainingCapacity,
        }
      });

      return new Response(JSON.stringify({
        allowed: false,
        reason: `This selection has reached the maximum number of entries.`,
        warnings: [],
        exposureInfo: {
          athleteName,
          currentExposurePct,
          maxExposurePct: config.max_athlete_exposure_pct * 100,
          remainingCapacity,
          isAtCapacity: true,
        },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === VALIDATION 6: Liability Cap (85% of handle) - BANKRUPTCY PROTECTION ===
    const newLiability = newAthleteTokens * currentOdds;
    const liabilityCap = newMarketHandle * 0.85;
    if (newLiability > liabilityCap) {
      console.log(`[VALIDATE] BLOCKED: Liability ${newLiability.toFixed(0)} exceeds 85% cap ${liabilityCap.toFixed(0)}`);
      
      await writeAuditLog(supabase, {
        actor_type: 'system',
        action_type: 'BET_BLOCKED_LIABILITY_CAP',
        entity_type: 'bet_validation',
        entity_id: `${marketId}_${athleteId}`,
        metadata: {
          user_id: userId,
          stake_amount: stakeAmount,
          new_liability: newLiability,
          liability_cap: liabilityCap,
          market_handle: newMarketHandle,
        }
      });

      return new Response(JSON.stringify({
        allowed: false,
        reason: 'Market liability limit reached for this selection.',
        warnings: [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === VALIDATION 7: Max Payout Cap (95% of handle) - BANKRUPTCY PROTECTION ===
    const maxPossiblePayout = newAthleteTokens * currentOdds;
    const payoutCap = newMarketHandle * 0.95;
    if (maxPossiblePayout > payoutCap) {
      console.log(`[VALIDATE] BLOCKED: Max payout ${maxPossiblePayout.toFixed(0)} exceeds 95% cap ${payoutCap.toFixed(0)}`);
      
      await writeAuditLog(supabase, {
        actor_type: 'system',
        action_type: 'BET_BLOCKED_PAYOUT_CAP',
        entity_type: 'bet_validation',
        entity_id: `${marketId}_${athleteId}`,
        metadata: {
          user_id: userId,
          stake_amount: stakeAmount,
          max_payout: maxPossiblePayout,
          payout_cap: payoutCap,
          market_handle: newMarketHandle,
        }
      });

      return new Response(JSON.stringify({
        allowed: false,
        reason: 'Maximum payout threshold reached for this market.',
        warnings: [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Add exposure info to result
    result.exposureInfo = {
      athleteName,
      currentExposurePct,
      maxExposurePct: config.max_athlete_exposure_pct * 100,
      remainingCapacity,
      isAtCapacity: false,
    };

    // Add warning if approaching cap (>25% of pool)
    if (newExposurePct > 25) {
      result.warnings.push(`${athleteName} is at ${newExposurePct.toFixed(1)}% of market pool (max ${config.max_athlete_exposure_pct * 100}%)`);
    }

    console.log(`[VALIDATE] ALLOWED: ${athleteName} at ${newExposurePct.toFixed(1)}% exposure`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Validation error:', error);
    return new Response(JSON.stringify({
      allowed: false,
      reason: 'Validation failed. Please try again.',
      warnings: [],
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
