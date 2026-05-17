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

interface ValidateEntryRequest {
  userId: string;
  tournamentId: string;
  marketId: string;
  athleteId: string;
  stakeAmount: number;
  currentOdds: number;
  marketType: 'WINNER' | 'PODIUM' | 'HIGHEST_SCORE';
  entryType?: 'single' | 'parlay';
}

interface ValidationResult {
  allowed: boolean;
  reason?: string;
  warnings: string[];
  solvencyInfo?: {
    availableBankrollUsd: number;
    worstCaseLossUsd: number;
    solvencyStatus: 'SAFE' | 'BLOCKED';
  };
}

// Risk config defaults - Global Solvency Model
const DEFAULT_CONFIG = {
  min_stake_tokens: 100,
  max_stake_tokens: 10000,
  max_payout_tokens: 150000,
  token_value_usd: 0.01,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: ValidateEntryRequest = await req.json();
    const { userId, tournamentId, marketId, athleteId, stakeAmount, currentOdds, marketType, entryType = 'single' } = body;

    const result: ValidationResult = {
      allowed: true,
      warnings: [],
    };

    console.log(`[VALIDATE] Global Solvency Model - Entry: ${stakeAmount}, Multiplier: ${currentOdds}`);

    // === VALIDATION 0: Minimum Stake ===
    if (stakeAmount < DEFAULT_CONFIG.min_stake_tokens) {
      return new Response(JSON.stringify({
        allowed: false,
        reason: `Minimum stake is ${DEFAULT_CONFIG.min_stake_tokens} tokens`,
        warnings: [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === VALIDATION 1: Stake Cap ===
    if (stakeAmount > DEFAULT_CONFIG.max_stake_tokens) {
      return new Response(JSON.stringify({
        allowed: false,
        reason: `Maximum stake is ${DEFAULT_CONFIG.max_stake_tokens.toLocaleString()} tokens`,
        warnings: [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === VALIDATION 2: Payout Cap ===
    const potentialPayout = stakeAmount * currentOdds;
    if (potentialPayout > DEFAULT_CONFIG.max_payout_tokens) {
      return new Response(JSON.stringify({
        allowed: false,
        reason: `Maximum payout is ${DEFAULT_CONFIG.max_payout_tokens.toLocaleString()} tokens. Reduce stake or pick different odds.`,
        warnings: [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === VALIDATION 2.5: EVENT HANDLE CIRCUIT BREAKER ===
    // Pre-check the per-tournament handle cap so users get a friendly message
    // before the DB-level trigger would reject the insert. The trigger is the
    // race-safe authority; this is UX only.
    {
      const { data: trn, error: trnErr } = await supabase
        .from('tournaments')
        .select('max_handle_tokens, current_handle_tokens')
        .eq('id', tournamentId)
        .maybeSingle();
      if (!trnErr && trn && trn.max_handle_tokens != null) {
        const projected = Number(trn.current_handle_tokens || 0) + stakeAmount;
        if (projected > Number(trn.max_handle_tokens)) {
          return new Response(JSON.stringify({
            allowed: false,
            reason: 'Predictions for this event have reached capacity. We pause new entries when an event hits its prediction limit to keep multipliers stable. Check back if entries reopen, or browse other events.',
            warnings: [],
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
    }

    // === VALIDATION 3: Duplicate Athlete Check (same user, same market) ===
    // Skip duplicate check for parlays — parlays may reference markets where user already has singles
    if (entryType !== 'parlay') {
      const { data: existingEntries } = await supabase
        .from('bet_slips')
        .select('id')
        .eq('user_id', userId)
        .eq('market_id', marketId)
        .eq('athlete_id', athleteId)
        // Include SETTLING: a slip mid-settlement is still a "live" entry from the
        // user's POV. Excluding it would let them double-bet during the settle window.
        .in('status', ['PENDING', 'SETTLING']);

      if (existingEntries && existingEntries.length > 0) {
        return new Response(JSON.stringify({
          allowed: false,
          reason: 'You already have an active entry on this athlete in this market',
          warnings: [],
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // === VALIDATION 4: GLOBAL SOLVENCY CHECK ===
    // === VALIDATION 3.5: PER-ATHLETE CONCENTRATION CAP ===
    // Soft-close entries on athletes who have reached their tiered cap.
    // Tier 1 (mult ≤ 4) = 18%, Tier 2 (≤ 7) = 22%, others 25%.
    // Skip for parlays — leg-level enforcement happens on the underlying single.
    if (entryType !== 'parlay') {
      const { data: capInfo, error: capErr } = await supabase.rpc('check_athlete_capacity', {
        p_market_id: marketId,
        p_athlete_id: athleteId,
        p_added_tokens: stakeAmount,
      });
      if (capErr) {
        console.error('[VALIDATE] capacity check error:', capErr);
        result.warnings.push('Capacity check unavailable');
      } else if (capInfo && (capInfo as any).at_cap) {
        // Look up athlete name for neutral message
        const { data: ath } = await supabase
          .from('athletes')
          .select('name')
          .eq('id', athleteId)
          .maybeSingle();
        const athName = ath?.name || 'This athlete';
        return new Response(JSON.stringify({
          allowed: false,
          reason: `${athName} is at predicted entry capacity for this division — try another pick.`,
          warnings: [],
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Fetch current bankroll status from the view
    const { data: bankrollStatus, error: bankrollError } = await supabase
      .from('house_bankroll_summary')
      .select('*')
      .single();

    if (bankrollError) {
      console.error('[VALIDATE] Failed to fetch bankroll status:', bankrollError);
      // If we can't check solvency, allow the bet but log warning
      result.warnings.push('Solvency check unavailable');
    } else {
      const availableBankroll = bankrollStatus.available_bankroll_usd || 5000;
      const tokenValueUsd = bankrollStatus.token_value_usd || 0.01;
      
      // Get current market handle and liability
      const { data: marketLiability } = await supabase
        .from('market_liability')
        .select('athlete_id, total_stake_tokens, liability_if_wins')
        .eq('market_id', marketId);

      // Calculate current handle and max liability
      const currentHandle = (marketLiability || []).reduce((sum, l) => sum + (l.total_stake_tokens || 0), 0);
      const currentMaxLiability = Math.max(...(marketLiability || []).map(l => l.liability_if_wins || 0), 0);
      
      // Calculate new state after this bet
      const currentAthleteLiability = (marketLiability || []).find(l => l.athlete_id === athleteId);
      const newAthleteTokens = (currentAthleteLiability?.total_stake_tokens || 0) + stakeAmount;
      const newAthleteLiability = newAthleteTokens * currentOdds;
      const newHandle = currentHandle + stakeAmount;
      
      // New max liability is the higher of current max or this athlete's new liability
      const newMaxLiability = Math.max(currentMaxLiability, newAthleteLiability);
      
      // Worst-case loss = max liability - handle (what house pays out minus what it collected)
      const worstCaseLossTokens = Math.max(0, newMaxLiability - newHandle);
      const worstCaseLossUsd = worstCaseLossTokens * tokenValueUsd;
      
      console.log(`[VALIDATE] Solvency Check: Available=${availableBankroll.toFixed(2)}, WorstCase=${worstCaseLossUsd.toFixed(2)}`);

      // GLOBAL SOLVENCY CHECK: Block if worst-case loss exceeds available bankroll
      if (worstCaseLossUsd > availableBankroll) {
        console.log(`[VALIDATE] BLOCKED: WorstCaseLoss $${worstCaseLossUsd.toFixed(2)} > Available $${availableBankroll.toFixed(2)}`);
        
        // Write audit log for blocked bet
        await writeAuditLog(supabase, {
          actor_type: 'system',
          action_type: 'BET_BLOCKED_SOLVENCY',
          entity_type: 'bet_validation',
          entity_id: `${marketId}_${athleteId}`,
          before_state: {
            available_bankroll_usd: availableBankroll,
            current_max_liability: currentMaxLiability,
            current_handle: currentHandle,
          },
          after_state: {
            new_max_liability: newMaxLiability,
            new_handle: newHandle,
            worst_case_loss_usd: worstCaseLossUsd,
          },
          metadata: {
            user_id: userId,
            stake_amount: stakeAmount,
            market_id: marketId,
            market_type: marketType,
            blocked_reason: 'GLOBAL_SOLVENCY_EXCEEDED',
          }
        });

        return new Response(JSON.stringify({
          allowed: false,
          reason: "This entry can't be placed right now. Please try a different selection.",
          warnings: [],
          solvencyInfo: {
            availableBankrollUsd: availableBankroll,
            worstCaseLossUsd,
            solvencyStatus: 'BLOCKED',
          },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Add solvency info to result
      result.solvencyInfo = {
        availableBankrollUsd: availableBankroll,
        worstCaseLossUsd,
        solvencyStatus: 'SAFE',
      };

      // Add warning if approaching limit (>80% of available)
      if (worstCaseLossUsd > availableBankroll * 0.8) {
        result.warnings.push(`High market exposure: ${((worstCaseLossUsd / availableBankroll) * 100).toFixed(0)}% of available bankroll`);
      }
    }

    // Get athlete name for logging
    const { data: athleteData } = await supabase
      .from('athletes')
      .select('name')
      .eq('id', athleteId)
      .single();

    const athleteName = athleteData?.name || 'Unknown';
    console.log(`[VALIDATE] ALLOWED: ${athleteName} - Stake: ${stakeAmount}, Payout: ${potentialPayout}`);

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
