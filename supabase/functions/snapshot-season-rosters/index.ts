import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Snapshot Season Rosters Edge Function
 * 
 * Creates roster snapshots for all season fantasy entries before a tournament starts.
 * This ensures that scoring uses the roster state at tournament start, not the current state.
 * 
 * Called with: { tournament_id: string }
 * 
 * Should be triggered:
 * - Manually by admin before a tournament starts
 * - Automatically via cron job before each tournament's start time
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tournament_id } = await req.json();

    if (!tournament_id) {
      throw new Error('tournament_id is required');
    }

    console.log(`Creating roster snapshots for tournament: ${tournament_id}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify admin access
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (!authError && user) {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();

        if (!roleData) {
          return new Response(
            JSON.stringify({ error: 'Forbidden: Admin access required' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
          );
        }
      }
    }

    // Get tournament details
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('id, name, start_datetime, start_date')
      .eq('id', tournament_id)
      .single();

    if (tournamentError || !tournament) {
      throw new Error(`Tournament not found: ${tournament_id}`);
    }

    console.log(`Snapshotting for tournament: ${tournament.name}`);

    // Find all season pots that include this tournament
    // Season pots either have season_tournaments array containing this ID,
    // or they have pot_type = 'season' with no explicit list (meaning all tournaments)
    const { data: seasonPots, error: potsError } = await supabase
      .from('fantasy_pots')
      .select('id, name, season_tournaments')
      .eq('pot_type', 'season')
      .in('status', ['open', 'locked']);

    if (potsError) throw potsError;

    // Filter to pots that include this tournament
    const relevantPots = (seasonPots || []).filter(pot => {
      // If no explicit list, includes all tournaments
      if (!pot.season_tournaments || pot.season_tournaments.length === 0) {
        return true;
      }
      // Otherwise, check if this tournament is in the list
      return pot.season_tournaments.includes(tournament_id);
    });

    console.log(`Found ${relevantPots.length} season pots for this tournament`);

    let totalSnapshots = 0;
    let skippedSnapshots = 0;

    for (const pot of relevantPots) {
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
        // Check if snapshot already exists for this entry+tournament
        const { data: existingSnapshot } = await supabase
          .from('fantasy_roster_snapshots')
          .select('id')
          .eq('entry_id', entry.id)
          .eq('tournament_id', tournament_id)
          .maybeSingle();

        if (existingSnapshot) {
          console.log(`Snapshot already exists for entry ${entry.id}, skipping`);
          skippedSnapshots++;
          continue;
        }

        // Get current roster
        const { data: rosterAthletes, error: rosterError } = await supabase
          .from('fantasy_entry_athletes')
          .select('athlete_id, discipline, price_at_selection')
          .eq('entry_id', entry.id);

        if (rosterError) {
          console.error(`Error fetching roster for entry ${entry.id}:`, rosterError);
          continue;
        }

        // Create snapshot
        const snapshotData = {
          athletes: (rosterAthletes || []).map(a => ({
            id: a.athlete_id,
            discipline: a.discipline,
            price: a.price_at_selection
          }))
        };

        const { error: insertError } = await supabase
          .from('fantasy_roster_snapshots')
          .insert({
            entry_id: entry.id,
            tournament_id: tournament_id,
            snapshot: snapshotData
          });

        if (insertError) {
          console.error(`Error creating snapshot for entry ${entry.id}:`, insertError);
          continue;
        }

        totalSnapshots++;
        console.log(`Created snapshot for entry ${entry.id} with ${rosterAthletes?.length || 0} athletes`);
      }
    }

    console.log(`Snapshot complete: ${totalSnapshots} created, ${skippedSnapshots} skipped (already existed)`);

    return new Response(
      JSON.stringify({
        success: true,
        tournament: tournament.name,
        snapshots_created: totalSnapshots,
        snapshots_skipped: skippedSnapshots,
        pots_processed: relevantPots.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in snapshot-season-rosters:', error);
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
