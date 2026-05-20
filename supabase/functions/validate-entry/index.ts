import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
}

// Risk config — beta launch (2026-05-20): all entry-side caps removed per
// product decision. No per-pick stake cap, payout cap, athlete concentration
// cap, event handle cap, or global solvency block. Wallet balance is the
// only upper bound. Purchase cap (50k tokens/day) lives in
// create-token-checkout. Re-add caps here only on explicit product change.
const MIN_STAKE_TOKENS = 100;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: ValidateEntryRequest = await req.json();
    const { userId, tournamentId, marketId, athleteId, stakeAmount, entryType = 'single' } = body;

    // === VALIDATION 1: EVENT NOT OPEN ===
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('betting_open_time')
      .eq('id', tournamentId)
      .maybeSingle();

    if (tournament?.betting_open_time) {
      const openTime = new Date(tournament.betting_open_time);
      if (openTime > new Date()) {
        const formatted = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          weekday: 'long', month: 'long', day: 'numeric',
          hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
        }).format(openTime);
        return new Response(JSON.stringify({
          allowed: false,
          reason: `Predictions for this event open ${formatted}.`,
          warnings: [],
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // === VALIDATION 2: Minimum Stake ===
    if (stakeAmount < MIN_STAKE_TOKENS) {
      return new Response(JSON.stringify({
        allowed: false,
        reason: `Minimum stake is ${MIN_STAKE_TOKENS} tokens`,
        warnings: [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === VALIDATION 3: Duplicate Athlete Check (same user, same market) ===
    // Skip for parlays — parlays may reference markets where user already has singles.
    if (entryType !== 'parlay') {
      const { data: existingEntries } = await supabase
        .from('bet_slips')
        .select('id')
        .eq('user_id', userId)
        .eq('market_id', marketId)
        .eq('athlete_id', athleteId)
        .in('status', ['PENDING', 'SETTLING']);

      if (existingEntries && existingEntries.length > 0) {
        return new Response(JSON.stringify({
          allowed: false,
          reason: 'You already have an active entry on this athlete in this market',
          warnings: [],
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const result: ValidationResult = { allowed: true, warnings: [] };
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
