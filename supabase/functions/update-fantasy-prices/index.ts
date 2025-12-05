import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Price adjustment factors
const PRICE_ADJUSTMENTS = {
  PODIUM_WIN: 1.15,
  PODIUM_2ND: 1.10,
  PODIUM_3RD: 1.07,
  MADE_FINALS: 1.03,
  POOR_FINISH: 0.97,
  MISSED_FIRST_PASS: 0.92,
  MISSED_GATE: 0.95,
  MISSED_EVENT_DECAY: 0.99,
  MAX_PRICE: 25000,
  MIN_PRICE: 1000
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tournament_id } = await req.json();

    if (!tournament_id) {
      throw new Error('tournament_id is required');
    }

    console.log(`Updating fantasy prices after tournament: ${tournament_id}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user is authenticated and is an admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Check if user has admin role
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !roleData) {
      console.error('User is not an admin:', user.id);
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    // Get tournament info to find expected participants
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('disciplines')
      .eq('id', tournament_id)
      .single();

    if (tournamentError) throw tournamentError;

    // Get all results for this tournament
    const { data: results, error: resultsError } = await supabase
      .from('athlete_results')
      .select('*')
      .eq('tournament_id', tournament_id);

    if (resultsError) throw resultsError;

    const athleteResultMap = new Map<string, any[]>();
    for (const result of results || []) {
      const key = result.athlete_id;
      if (!athleteResultMap.has(key)) {
        athleteResultMap.set(key, []);
      }
      athleteResultMap.get(key)!.push(result);
    }

    // Get all athletes who could have competed
    const { data: allAthletes, error: athletesError } = await supabase
      .from('athletes')
      .select('id, disciplines, fantasy_price_slalom, fantasy_price_trick, fantasy_price_jump, missed_events_count');

    if (athletesError) throw athletesError;

    let updated = 0;

    for (const athlete of allAthletes || []) {
      const athleteResults = athleteResultMap.get(athlete.id) || [];
      const updates: Record<string, any> = {};

      for (const discipline of ['slalom', 'trick', 'jump'] as const) {
        if (!athlete.disciplines.includes(discipline)) continue;
        if (!tournament.disciplines.includes(discipline)) continue;

        const priceField = `fantasy_price_${discipline}` as const;
        const currentPrice = athlete[priceField] || 5000;

        const discResult = athleteResults.find(r => r.discipline === discipline);

        if (discResult) {
          // Athlete competed - apply performance adjustments
          let multiplier = 1;

          if (discResult.position === 1) multiplier *= PRICE_ADJUSTMENTS.PODIUM_WIN;
          else if (discResult.position === 2) multiplier *= PRICE_ADJUSTMENTS.PODIUM_2ND;
          else if (discResult.position === 3) multiplier *= PRICE_ADJUSTMENTS.PODIUM_3RD;
          else if (discResult.position > 10) multiplier *= PRICE_ADJUSTMENTS.POOR_FINISH;

          if (discResult.made_finals) multiplier *= PRICE_ADJUSTMENTS.MADE_FINALS;
          if (discResult.missed_first_pass) multiplier *= PRICE_ADJUSTMENTS.MISSED_FIRST_PASS;
          if (discResult.missed_gate) multiplier *= PRICE_ADJUSTMENTS.MISSED_GATE;

          const newPrice = Math.round(currentPrice * multiplier);
          updates[priceField] = Math.max(PRICE_ADJUSTMENTS.MIN_PRICE, Math.min(PRICE_ADJUSTMENTS.MAX_PRICE, newPrice));
        } else {
          // Athlete missed this event - apply decay
          const newPrice = Math.round(currentPrice * PRICE_ADJUSTMENTS.MISSED_EVENT_DECAY);
          updates[priceField] = Math.max(PRICE_ADJUSTMENTS.MIN_PRICE, newPrice);
          updates.missed_events_count = (athlete.missed_events_count || 0) + 1;
        }
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('athletes')
          .update(updates)
          .eq('id', athlete.id);

        if (updateError) {
          console.error(`Error updating athlete ${athlete.id}:`, updateError);
        } else {
          updated++;
        }
      }
    }

    console.log(`Updated prices for ${updated} athletes`);

    return new Response(JSON.stringify({
      success: true,
      athletes_updated: updated
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in update-fantasy-prices:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
