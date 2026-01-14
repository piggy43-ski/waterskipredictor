import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  adjustedOdds?: number;
  reason?: string;
  warnings: string[];
  currentLiability?: {
    athleteName: string;
    currentPct: number;
    cappedPct: number;
    liabilityIfWins: number;
    marketHandle: number;
  };
}

// Risk config defaults
const DEFAULT_CONFIG = {
  max_stake_tokens: 10000,
  max_payout_tokens: 150000,
  liability_cap_winner: 0.35,
  liability_cap_podium: 0.30,
  liability_cap_highest_score: 0.30,
  max_athlete_allocation_pct: 0.25,
};

// Round down to nearest 0.25 for odds shortening
function roundDownToLadder(odds: number): number {
  return Math.max(1.25, Math.floor(odds * 4) / 4);
}

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

    // Fetch risk config
    const { data: configData } = await supabase
      .from('risk_config')
      .select('key, value');
    
    const config = { ...DEFAULT_CONFIG };
    if (configData) {
      for (const row of configData) {
        const numVal = parseFloat(row.value as string);
        if (!isNaN(numVal)) {
          (config as any)[row.key] = numVal;
        }
      }
    }

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

    // === VALIDATION 4: 25% Allocation Limit ===
    // Get user's total stake for this tournament
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

    // === VALIDATION 5: Market Liability Cap ===
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

    const marketHandle = (allMarketLiability || []).reduce((sum, l) => sum + (l.total_stake_tokens || 0), 0) + stakeAmount;

    // Get liability cap based on market type
    let liabilityCap = config.liability_cap_winner;
    if (marketType === 'PODIUM') liabilityCap = config.liability_cap_podium;
    if (marketType === 'HIGHEST_SCORE') liabilityCap = config.liability_cap_highest_score;

    const currentLiabilityIfWins = liability?.liability_if_wins || 0;
    const newLiabilityIfWins = currentLiabilityIfWins + (potentialPayout - stakeAmount);
    const maxAllowedLiability = marketHandle * liabilityCap;

    // Get athlete name for display
    const { data: athleteData } = await supabase
      .from('athletes')
      .select('name')
      .eq('id', athleteId)
      .single();

    const athleteName = athleteData?.name || 'Unknown';

    if (newLiabilityIfWins > maxAllowedLiability) {
      // Calculate shortened odds that would stay under cap
      const remainingLiability = maxAllowedLiability - currentLiabilityIfWins;
      
      if (remainingLiability <= 0) {
        // No room left - block the bet
        return new Response(JSON.stringify({
          allowed: false,
          reason: `Market exposure limit reached for ${athleteName}. Try a different athlete.`,
          warnings: [],
          currentLiability: {
            athleteName,
            currentPct: (currentLiabilityIfWins / marketHandle) * 100,
            cappedPct: liabilityCap * 100,
            liabilityIfWins: currentLiabilityIfWins,
            marketHandle,
          },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Calculate max payout that stays under cap
      const maxPayout = remainingLiability + stakeAmount;
      const maxOdds = maxPayout / stakeAmount;
      const shortenedOdds = roundDownToLadder(maxOdds);

      if (shortenedOdds < 1.25) {
        return new Response(JSON.stringify({
          allowed: false,
          reason: `Market exposure limit reached for ${athleteName}. Odds cannot be shortened further.`,
          warnings: [],
          currentLiability: {
            athleteName,
            currentPct: (currentLiabilityIfWins / marketHandle) * 100,
            cappedPct: liabilityCap * 100,
            liabilityIfWins: currentLiabilityIfWins,
            marketHandle,
          },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Odds shortened
      result.adjustedOdds = shortenedOdds;
      result.warnings.push(`Odds adjusted from ${currentOdds.toFixed(2)}x to ${shortenedOdds.toFixed(2)}x due to market exposure limits`);
    }

    // Add liability info
    result.currentLiability = {
      athleteName,
      currentPct: marketHandle > 0 ? (currentLiabilityIfWins / marketHandle) * 100 : 0,
      cappedPct: liabilityCap * 100,
      liabilityIfWins: currentLiabilityIfWins,
      marketHandle,
    };

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