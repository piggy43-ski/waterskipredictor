import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// F1-style position points
const POSITION_POINTS: Record<number, number> = {
  1: 25, 2: 18, 3: 15, 4: 12, 5: 10,
  6: 8, 7: 6, 8: 4, 9: 2, 10: 1
};

// Bonus points
const BONUSES = {
  highest_score: 5,
  made_finals: 3,
};

// Penalty points
const PENALTIES = {
  missed_finals: -2,
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

    // Get all athlete results for this tournament
    const { data: results, error: resultsError } = await supabase
      .from('athlete_results')
      .select('*')
      .eq('tournament_id', tournament_id);

    if (resultsError) throw resultsError;

    if (!results || results.length === 0) {
      console.log('No results found for tournament');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No results to score' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${results.length} athlete results`);

    // Find highest scores by discipline/gender
    const highestScores = new Map<string, { athlete_id: string; score: number }>();
    for (const result of results) {
      if (result.score_raw === null) continue;
      const key = `${result.discipline}_${result.gender}`;
      const current = highestScores.get(key);
      if (!current || result.score_raw > current.score) {
        highestScores.set(key, { athlete_id: result.athlete_id, score: result.score_raw });
      }
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

    // Process each pot
    for (const pot of pots || []) {
      // Get all entries for this pot
      const { data: entries, error: entriesError } = await supabase
        .from('fantasy_entries')
        .select('id, user_id')
        .eq('pot_id', pot.id);

      if (entriesError) {
        console.error(`Error fetching entries for pot ${pot.id}:`, entriesError);
        continue;
      }

      for (const entry of entries || []) {
        // Get athletes in this entry's roster
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
          // Find this athlete's result for this tournament/discipline
          const athleteResult = results.find(
            r => r.athlete_id === rosterAthlete.athlete_id && 
                 r.discipline === rosterAthlete.discipline
          );

          if (!athleteResult) continue;

          // Calculate points
          let points = 0;
          const breakdown: Record<string, number> = {};

          // Position points
          if (athleteResult.position && POSITION_POINTS[athleteResult.position]) {
            points += POSITION_POINTS[athleteResult.position];
            breakdown.position = POSITION_POINTS[athleteResult.position];
          }

          // Highest score bonus
          const categoryKey = `${athleteResult.discipline}_${athleteResult.gender}`;
          const highestInCategory = highestScores.get(categoryKey);
          if (highestInCategory?.athlete_id === athleteResult.athlete_id) {
            points += BONUSES.highest_score;
            breakdown.highest_score = BONUSES.highest_score;
          }

          // Made finals bonus
          if (athleteResult.made_finals) {
            points += BONUSES.made_finals;
            breakdown.made_finals = BONUSES.made_finals;
          } else if (athleteResult.position !== null) {
            points += PENALTIES.missed_finals;
            breakdown.missed_finals = PENALTIES.missed_finals;
          }

          // Penalties
          if (athleteResult.missed_first_pass) {
            points += PENALTIES.missed_first_pass;
            breakdown.missed_first_pass = PENALTIES.missed_first_pass;
          }
          if (athleteResult.missed_gate) {
            points += PENALTIES.missed_gate;
            breakdown.missed_gate = PENALTIES.missed_gate;
          }

          // Ensure non-negative
          points = Math.max(0, points);

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
