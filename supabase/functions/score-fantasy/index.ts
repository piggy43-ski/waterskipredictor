import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Position points for athletes who make the final
const POSITION_POINTS: Record<number, number> = {
  1: 25, 2: 20, 3: 16, 4: 13, 5: 11,
  6: 9, 7: 7, 8: 5, 9: 3, 10: 3, 11: 3, 12: 3
};
const DEFAULT_FINALIST_POINTS = 1; // For positions >12

// Bonus points
const BONUSES = {
  made_finals: 3,           // Made it to finals
  highest_score_event: 5,   // Highest score across all rounds
  podium_1st: 3,            // Extra for 1st place
  podium_2nd_3rd: 2,        // Extra for 2nd or 3rd
};

// Penalty points
const PENALTIES = {
  did_not_make_finals: -5,   // Started but didn't make finals
  missed_first_pass: -10,    // Failed first pass
  missed_gate: -3,           // Missed a gate
  no_show: -50,              // DNS/DNF/DQ
};

// Streak multipliers
const STREAK_MULTIPLIERS = {
  consecutive_2: 1.10,       // 2nd consecutive positive event
  consecutive_3_plus: 1.20,  // 3rd+ consecutive (capped)
};

function getPositionPoints(position: number): number {
  if (position >= 1 && position <= 12) {
    return POSITION_POINTS[position] ?? DEFAULT_FINALIST_POINTS;
  }
  if (position > 12) return DEFAULT_FINALIST_POINTS;
  return 0;
}

function getPodiumBonus(position: number): number {
  if (position === 1) return BONUSES.podium_1st;
  if (position === 2 || position === 3) return BONUSES.podium_2nd_3rd;
  return 0;
}

function getStreakMultiplier(consecutivePositiveEvents: number): number {
  if (consecutivePositiveEvents >= 3) return STREAK_MULTIPLIERS.consecutive_3_plus;
  if (consecutivePositiveEvents === 2) return STREAK_MULTIPLIERS.consecutive_2;
  return 1.0;
}

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

    // Get athlete streak data (consecutive positive events)
    // This would need historical data - for now we'll implement without streaks
    // TODO: Query previous fantasy_scoring_events to calculate streaks

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

          let rawPoints = 0;
          let finalPoints = 0;
          const breakdown: Record<string, number> = {};

          // Check for no-show: athlete has no result at all OR has no_score = true
          if (!hasAnyResult) {
            // No entry at all - apply no-show penalty
            rawPoints = PENALTIES.no_show;
            breakdown.no_show = PENALTIES.no_show;
            console.log(`Athlete ${rosterAthlete.athlete_id} has no entry - applying no-show penalty`);
          } else if (finalsResult?.no_score) {
            // Has entry but no_score = true (DNF/DNS/DQ)
            rawPoints = PENALTIES.no_show;
            breakdown.no_show = PENALTIES.no_show;
            console.log(`Athlete ${rosterAthlete.athlete_id} has no_score=true - applying no-show penalty`);
          } else if (finalsResult) {
            // Has valid finals result - calculate points
            const position = finalsResult.final_overall_rank;

            // Position points based on final_overall_rank
            if (position && position > 0) {
              const positionPts = getPositionPoints(position);
              rawPoints += positionPts;
              breakdown.position = positionPts;

              // Podium bonus
              const podiumBonus = getPodiumBonus(position);
              if (podiumBonus > 0) {
                rawPoints += podiumBonus;
                breakdown.podium_bonus = podiumBonus;
              }
            }

            // Made finals bonus
            if (finalsResult.made_finals) {
              rawPoints += BONUSES.made_finals;
              breakdown.made_finals = BONUSES.made_finals;
            }

            // Highest score bonus (across all rounds)
            const categoryKey = `${finalsResult.discipline}_${finalsResult.gender}`;
            const highestInCategory = highestScores.get(categoryKey);
            if (highestInCategory?.athlete_id === rosterAthlete.athlete_id) {
              rawPoints += BONUSES.highest_score_event;
              breakdown.highest_score = BONUSES.highest_score_event;
            }

            // Penalties
            if (finalsResult.missed_first_pass) {
              rawPoints += PENALTIES.missed_first_pass;
              breakdown.missed_first_pass = PENALTIES.missed_first_pass;
            }
            if (finalsResult.missed_gate) {
              rawPoints += PENALTIES.missed_gate;
              breakdown.missed_gate = PENALTIES.missed_gate;
            }
          } else {
            // Has results in earlier rounds but didn't make finals
            rawPoints += PENALTIES.did_not_make_finals;
            breakdown.did_not_make_finals = PENALTIES.did_not_make_finals;

            // Check if they had the highest score even without making finals
            // Find any result for this athlete in this discipline
            const athleteResults = allResults.filter(
              r => r.athlete_id === rosterAthlete.athlete_id && r.discipline === rosterAthlete.discipline
            );
            if (athleteResults.length > 0) {
              const categoryKey = `${rosterAthlete.discipline}_${athleteResults[0].gender}`;
              const highestInCategory = highestScores.get(categoryKey);
              if (highestInCategory?.athlete_id === rosterAthlete.athlete_id) {
                rawPoints += BONUSES.highest_score_event;
                breakdown.highest_score = BONUSES.highest_score_event;
              }

              // Still apply penalties from their runs
              for (const result of athleteResults) {
                if (result.missed_first_pass && !breakdown.missed_first_pass) {
                  rawPoints += PENALTIES.missed_first_pass;
                  breakdown.missed_first_pass = PENALTIES.missed_first_pass;
                }
                if (result.missed_gate && !breakdown.missed_gate) {
                  rawPoints += PENALTIES.missed_gate;
                  breakdown.missed_gate = PENALTIES.missed_gate;
                }
              }
            }
          }

          // Store raw points before streak
          breakdown.raw_total = rawPoints;
          finalPoints = rawPoints;

          // TODO: Apply streak multiplier based on historical data
          // For now, streak bonus would need to query previous events
          // const consecutiveEvents = await getConsecutivePositiveEvents(supabase, rosterAthlete.athlete_id, rosterAthlete.discipline);
          // if (rawPoints > 0 && consecutiveEvents >= 2) {
          //   const multiplier = getStreakMultiplier(consecutiveEvents);
          //   finalPoints = Math.round(rawPoints * multiplier);
          //   breakdown.streak_multiplier = multiplier;
          //   breakdown.streak_bonus = finalPoints - rawPoints;
          // }

          // Update roster athlete points
          await supabase
            .from('fantasy_entry_athletes')
            .update({ points_earned: finalPoints })
            .eq('id', rosterAthlete.id);

          // Create scoring event with full breakdown
          await supabase
            .from('fantasy_scoring_events')
            .insert({
              entry_id: entry.id,
              athlete_id: rosterAthlete.athlete_id,
              tournament_id,
              discipline: rosterAthlete.discipline,
              points_awarded: finalPoints,
              breakdown
            });

          entryTotalPoints += finalPoints;
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
