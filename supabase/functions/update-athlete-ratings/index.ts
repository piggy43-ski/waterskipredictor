import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Update athlete ratings after tournament results
 * 
 * Form boost adjustments:
 * - Win: +3
 * - Podium (2nd/3rd): +2
 * - Made finals (4th-8th): +1
 * - Poor result / early out: -1
 * 
 * Activity decay:
 * - +0.5 per event missed
 */

// Map rating to fantasy price
function ratingToFantasyPrice(rating: number): number {
  if (rating >= 97) return 12000;
  if (rating >= 95) return 11000;
  if (rating >= 92) return 10000;
  if (rating >= 90) return 9500;
  if (rating >= 87) return 9000;
  if (rating >= 85) return 8500;
  if (rating >= 82) return 8000;
  if (rating >= 80) return 7500;
  if (rating >= 77) return 7000;
  if (rating >= 75) return 6500;
  if (rating >= 72) return 6000;
  if (rating >= 70) return 5500;
  return 5000;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { tournament_id, apply_decay_to_inactive = true } = await req.json();

    if (!tournament_id) {
      throw new Error('tournament_id is required');
    }

    console.log(`Updating athlete ratings for tournament: ${tournament_id}`);

    // Get tournament info
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', tournament_id)
      .single();

    if (tournamentError || !tournament) {
      throw new Error(`Tournament not found: ${tournamentError?.message}`);
    }

    // Get all results for this tournament
    const { data: results, error: resultsError } = await supabase
      .from('athlete_results')
      .select('*, athlete:athletes(*)')
      .eq('tournament_id', tournament_id);

    if (resultsError) {
      throw new Error(`Failed to fetch results: ${resultsError.message}`);
    }

    console.log(`Found ${results?.length || 0} results to process`);

    const updates = {
      boosted: [] as string[],
      decayed: [] as string[],
      errors: [] as string[]
    };

    // Process each result
    for (const result of results || []) {
      try {
        const discipline = result.discipline as 'slalom' | 'trick' | 'jump';
        const athlete = result.athlete;
        
        if (!athlete) continue;

        // Get current values
        const currentFormBoost = athlete[`form_boost_${discipline}`] || 0;
        const baseStrength = athlete[`base_strength_${discipline}`] || 70;
        const activityDecay = athlete[`activity_decay_${discipline}`] || 0;

        // Calculate form boost adjustment
        let formBoostDelta = 0;
        const position = result.position;

        if (position === 1) {
          formBoostDelta = 3; // Win
        } else if (position && position <= 3) {
          formBoostDelta = 2; // Podium
        } else if (result.made_finals || (position && position <= 8)) {
          formBoostDelta = 1; // Made finals
        } else if (position && position > 10) {
          formBoostDelta = -1; // Poor result
        } else if (result.missed_first_pass || result.missed_gate) {
          formBoostDelta = -1; // Technical failure
        }

        // Calculate new values
        const newFormBoost = Math.max(-20, Math.min(20, currentFormBoost + formBoostDelta));
        const resetDecay = 0; // Reset decay since they competed
        const newCurrentRating = Math.max(50, Math.min(100, baseStrength + newFormBoost - resetDecay));
        const newFantasyPrice = ratingToFantasyPrice(newCurrentRating);
        const newOddsScore = newCurrentRating / 100;

        // Update athlete
        const { error: updateError } = await supabase
          .from('athletes')
          .update({
            [`form_boost_${discipline}`]: newFormBoost,
            [`activity_decay_${discipline}`]: resetDecay,
            [`current_rating_${discipline}`]: newCurrentRating,
            [`fantasy_price_${discipline}`]: newFantasyPrice,
            [`odds_strength_score_${discipline}`]: newOddsScore
          })
          .eq('id', athlete.id);

        if (updateError) {
          updates.errors.push(`${athlete.name}: ${updateError.message}`);
        } else {
          updates.boosted.push(`${athlete.name} (${discipline}): ${formBoostDelta > 0 ? '+' : ''}${formBoostDelta}`);
        }
      } catch (err: unknown) {
        const errMessage = err instanceof Error ? err.message : 'Unknown error';
        updates.errors.push(`Result ${result.id}: ${errMessage}`);
      }
    }

    // Apply decay to athletes who didn't compete (if enabled)
    if (apply_decay_to_inactive) {
      // Get all tournament entries (athletes who were entered)
      const { data: entries } = await supabase
        .from('tournament_entries')
        .select('athlete_id, discipline')
        .eq('tournament_id', tournament_id);

      const competedAthleteIds = new Set(
        results?.map(r => `${r.athlete_id}-${r.discipline}`) || []
      );

      // For athletes entered but didn't compete
      for (const entry of entries || []) {
        const key = `${entry.athlete_id}-${entry.discipline}`;
        if (!competedAthleteIds.has(key)) {
          const discipline = entry.discipline as 'slalom' | 'trick' | 'jump';

          // Get athlete
          const { data: athlete } = await supabase
            .from('athletes')
            .select('*')
            .eq('id', entry.athlete_id)
            .single();

          if (athlete && !athlete.is_retired) {
            const currentDecay = athlete[`activity_decay_${discipline}`] || 0;
            const baseStrength = athlete[`base_strength_${discipline}`] || 70;
            const formBoost = athlete[`form_boost_${discipline}`] || 0;

            const newDecay = Math.min(20, currentDecay + 0.5);
            const newRating = Math.max(50, Math.min(100, baseStrength + formBoost - newDecay));
            const newFantasyPrice = ratingToFantasyPrice(newRating);

            const { error } = await supabase
              .from('athletes')
              .update({
                [`activity_decay_${discipline}`]: newDecay,
                [`current_rating_${discipline}`]: newRating,
                [`fantasy_price_${discipline}`]: newFantasyPrice,
                [`odds_strength_score_${discipline}`]: newRating / 100
              })
              .eq('id', entry.athlete_id);

            if (!error) {
              updates.decayed.push(`${athlete.name} (${discipline}): decay +0.5`);
            }
          }
        }
      }
    }

    console.log(`Rating updates complete: ${updates.boosted.length} boosted, ${updates.decayed.length} decayed`);

    return new Response(JSON.stringify({
      success: true,
      tournament: tournament.name,
      boosted: updates.boosted,
      decayed: updates.decayed,
      errors: updates.errors.length > 0 ? updates.errors : undefined
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Update athlete ratings error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
