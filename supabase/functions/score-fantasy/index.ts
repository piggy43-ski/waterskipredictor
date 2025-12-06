import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// F1-style position points (based on final_overall_rank)
const POSITION_POINTS: Record<number, number> = {
  1: 25, 2: 18, 3: 15, 4: 12, 5: 10,
  6: 8, 7: 6, 8: 4, 9: 2, 10: 1
};

// Bonus points
const BONUSES = {
  highest_score: 5,  // Posted highest score across all rounds
  made_finals: 3,    // Made it to finals
};

// Penalty points
const PENALTIES = {
  missed_finals: -2,    // Had results but didn't make finals
  no_show: -50,         // DNF/DNS/DQ - no_score = true or no entry at all
  missed_first_pass: -5,
  missed_gate: -3,
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

    console.log(`Scoring fantasy for tournament: ${tournament_id}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user is authenticated and is an admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !roleData) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    // Get ALL tournament_results for this tournament (all rounds)
    const { data: allResults, error: resultsError } = await supabase
      .from('tournament_results')
      .select('*')
      .eq('tournament_id', tournament_id);

    if (resultsError) throw resultsError;

    if (!allResults || allResults.length === 0) {
      console.log('No results found for tournament');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No results to score' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${allResults.length} tournament results across all rounds`);

    // Find highest scores by discipline/gender across ALL rounds
    const highestScores = new Map<string, { athlete_id: string; score: number }>();
    for (const result of allResults) {
      if (result.raw_score === null || result.raw_score === 0) continue;
      const key = `${result.discipline}_${result.gender}`;
      const current = highestScores.get(key);
      if (!current || result.raw_score > current.score) {
        highestScores.set(key, { athlete_id: result.athlete_id, score: result.raw_score });
      }
    }

    console.log(`Highest scores found:`, Object.fromEntries(highestScores));

    // Get finals results only (for position points)
    const finalsResults = allResults.filter(r => r.round_type === 'final');
    console.log(`Found ${finalsResults.length} finals results`);

    // Create lookup maps
    const finalsMap = new Map<string, typeof finalsResults[0]>();
    for (const result of finalsResults) {
      const key = `${result.athlete_id}_${result.discipline}`;
      finalsMap.set(key, result);
    }

    // Check if athlete had any result in any round
    const athleteHasResult = new Map<string, boolean>();
    for (const result of allResults) {
      const key = `${result.athlete_id}_${result.discipline}`;
      athleteHasResult.set(key, true);
    }

    // Get fantasy pots that include this tournament
    const { data: pots, error: potsError } = await supabase
      .from('fantasy_pots')
      .select('id, pot_type, tournament_id, season_tournaments, discipline_scope')
      .or(`tournament_id.eq.${tournament_id},season_tournaments.cs.{${tournament_id}}`);

    if (potsError) throw potsError;

    console.log(`Found ${pots?.length || 0} fantasy pots`);

    let totalEntriesScored = 0;
    let totalScoringEvents = 0;

    for (const pot of pots || []) {
      const { data: entries, error: entriesError } = await supabase
        .from('fantasy_entries')
        .select('id, user_id')
        .eq('pot_id', pot.id);

      if (entriesError) {
        console.error(`Error fetching entries for pot ${pot.id}:`, entriesError);
        continue;
      }

      for (const entry of entries || []) {
        const { data: rosterAthletes, error: rosterError } = await supabase
          .from('fantasy_entry_athletes')
          .select('id, athlete_id, discipline')
          .eq('entry_id', entry.id);

        if (rosterError) {
          console.error(`Error fetching roster for entry ${entry.id}:`, rosterError);
          continue;
        }

        let entryTotalPoints = 0;

        for (const rosterAthlete of rosterAthletes || []) {
          const lookupKey = `${rosterAthlete.athlete_id}_${rosterAthlete.discipline}`;
          const finalsResult = finalsMap.get(lookupKey);
          const hasAnyResult = athleteHasResult.get(lookupKey);

          let points = 0;
          const breakdown: Record<string, number> = {};

          // Check for no-show: athlete has no result at all OR has no_score = true
          if (!hasAnyResult) {
            // No entry at all - apply no-show penalty
            points += PENALTIES.no_show;
            breakdown.no_show = PENALTIES.no_show;
            console.log(`Athlete ${rosterAthlete.athlete_id} has no entry - applying no-show penalty`);
          } else if (finalsResult?.no_score) {
            // Has entry but no_score = true (DNF/DNS/DQ)
            points += PENALTIES.no_show;
            breakdown.no_show = PENALTIES.no_show;
            console.log(`Athlete ${rosterAthlete.athlete_id} has no_score=true - applying no-show penalty`);
          } else if (finalsResult) {
            // Has valid finals result - calculate points

            // Position points based on final_overall_rank
            if (finalsResult.final_overall_rank && POSITION_POINTS[finalsResult.final_overall_rank]) {
              points += POSITION_POINTS[finalsResult.final_overall_rank];
              breakdown.position = POSITION_POINTS[finalsResult.final_overall_rank];
            }

            // Highest score bonus (across all rounds)
            const categoryKey = `${finalsResult.discipline}_${finalsResult.gender}`;
            const highestInCategory = highestScores.get(categoryKey);
            if (highestInCategory?.athlete_id === rosterAthlete.athlete_id) {
              points += BONUSES.highest_score;
              breakdown.highest_score = BONUSES.highest_score;
            }

            // Made finals bonus
            if (finalsResult.made_finals) {
              points += BONUSES.made_finals;
              breakdown.made_finals = BONUSES.made_finals;
            }

            // Penalties
            if (finalsResult.missed_first_pass) {
              points += PENALTIES.missed_first_pass;
              breakdown.missed_first_pass = PENALTIES.missed_first_pass;
            }
            if (finalsResult.missed_gate) {
              points += PENALTIES.missed_gate;
              breakdown.missed_gate = PENALTIES.missed_gate;
            }
          } else {
            // Has results in earlier rounds but didn't make finals
            points += PENALTIES.missed_finals;
            breakdown.missed_finals = PENALTIES.missed_finals;
          }

          // Ensure non-negative (or allow negative for severe penalties)
          // For no-shows, we might want to allow negative to really penalize

          // Update roster athlete points
          await supabase
            .from('fantasy_entry_athletes')
            .update({ points_earned: points })
            .eq('id', rosterAthlete.id);

          // Create scoring event
          await supabase
            .from('fantasy_scoring_events')
            .insert({
              entry_id: entry.id,
              athlete_id: rosterAthlete.athlete_id,
              tournament_id,
              discipline: rosterAthlete.discipline,
              points_awarded: points,
              breakdown
            });

          entryTotalPoints += points;
          totalScoringEvents++;
        }

        // Update entry total points
        const { data: currentEntry } = await supabase
          .from('fantasy_entries')
          .select('total_points')
          .eq('id', entry.id)
          .single();

        await supabase
          .from('fantasy_entries')
          .update({ 
            total_points: (currentEntry?.total_points || 0) + entryTotalPoints 
          })
          .eq('id', entry.id);

        totalEntriesScored++;
      }

      // Update rankings for this pot
      const { data: rankedEntries } = await supabase
        .from('fantasy_entries')
        .select('id, total_points')
        .eq('pot_id', pot.id)
        .order('total_points', { ascending: false });

      for (let i = 0; i < (rankedEntries?.length || 0); i++) {
        await supabase
          .from('fantasy_entries')
          .update({ rank: i + 1 })
          .eq('id', rankedEntries![i].id);
      }
    }

    console.log(`Scoring complete: ${totalEntriesScored} entries, ${totalScoringEvents} events`);

    return new Response(JSON.stringify({
      success: true,
      entries_scored: totalEntriesScored,
      scoring_events: totalScoringEvents
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in score-fantasy:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
