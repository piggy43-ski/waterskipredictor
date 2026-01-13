import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Constants
const MAJOR_MULTIPLIER = 1.25;
const DELTA_CAP = 12;

// K-factor based on season starts
function getKFactor(seasonStarts: number): number {
  if (seasonStarts <= 3) return 30;
  if (seasonStarts <= 7) return 22;
  return 16;
}

// Get rating field name for discipline
function getRatingField(discipline: string): string {
  return `current_rating_${discipline}`;
}

// Get season events field name for discipline
function getSeasonEventsField(discipline: string): string {
  return `season_events_${discipline}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { tournament_id, is_major = false } = await req.json();

    if (!tournament_id) {
      return new Response(
        JSON.stringify({ error: "tournament_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all markets for this tournament
    const { data: markets, error: marketsError } = await supabase
      .from("markets")
      .select("id, discipline, category")
      .eq("tournament_id", tournament_id);

    if (marketsError) throw marketsError;
    if (!markets || markets.length === 0) {
      return new Response(
        JSON.stringify({ message: "No markets found for tournament", updated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allUpdates: any[] = [];
    const allHistoryInserts: any[] = [];

    for (const market of markets) {
      // Get results for this market
      const { data: results, error: resultsError } = await supabase
        .from("market_results")
        .select("athlete_id, final_rank")
        .eq("market_id", market.id)
        .order("final_rank", { ascending: true });

      if (resultsError) throw resultsError;
      if (!results || results.length < 2) continue;

      const N = results.length;
      const discipline = market.discipline.toLowerCase();
      const ratingField = getRatingField(discipline);
      const seasonEventsField = getSeasonEventsField(discipline);

      // Get athlete IDs
      const athleteIds = results.map(r => r.athlete_id);

      // Fetch current ratings for all athletes
      const { data: athletes, error: athletesError } = await supabase
        .from("athletes")
        .select("id, current_rating_slalom, current_rating_trick, current_rating_jump, season_events_slalom, season_events_trick, season_events_jump")
        .in("id", athleteIds);

      if (athletesError) throw athletesError;
      if (!athletes) continue;

      // Build rating map
      const ratingMap = new Map<string, { rating: number; seasonEvents: number }>();
      for (const athlete of athletes) {
        const rating = discipline === 'slalom' ? athlete.current_rating_slalom : 
                      discipline === 'trick' ? athlete.current_rating_trick : athlete.current_rating_jump;
        const events = discipline === 'slalom' ? athlete.season_events_slalom :
                      discipline === 'trick' ? athlete.season_events_trick : athlete.season_events_jump;
        ratingMap.set(athlete.id, {
          rating: rating ?? 70,
          seasonEvents: events ?? 0,
        });
      }

      // Build rank map
      const rankMap = new Map<string, number>();
      for (const result of results) {
        rankMap.set(result.athlete_id, result.final_rank);
      }

      // Calculate deltas using Elo pairwise comparison
      for (const result of results) {
        const athleteId = result.athlete_id;
        const rank_i = result.final_rank;
        const athleteData = ratingMap.get(athleteId);
        if (!athleteData) continue;

        const R_i = athleteData.rating;
        const seasonEvents = athleteData.seasonEvents;

        // Actual score: wins = N - rank, S = wins / (N - 1)
        const wins_i = N - rank_i;
        const S_i = wins_i / (N - 1);

        // Expected score: average probability of beating each opponent
        let expectedSum = 0;
        let opponentCount = 0;
        for (const [oppId, oppData] of ratingMap) {
          if (oppId === athleteId) continue;
          const R_j = oppData.rating;
          const P_ij = 1 / (1 + Math.pow(10, (R_j - R_i) / 400));
          expectedSum += P_ij;
          opponentCount++;
        }
        const E_i = opponentCount > 0 ? expectedSum / opponentCount : 0.5;

        // K-factor based on season starts
        const K = getKFactor(seasonEvents);

        // Calculate delta
        let delta = K * (S_i - E_i);

        // Apply major multiplier
        if (is_major) {
          delta *= MAJOR_MULTIPLIER;
        }

        // Cap delta
        delta = Math.max(-DELTA_CAP, Math.min(DELTA_CAP, delta));

        const newRating = R_i + delta;

        // Prepare update
        const updateObj: any = {
          id: athleteId,
          [ratingField]: Math.round(newRating * 100) / 100,
          [seasonEventsField]: seasonEvents + 1,
          updated_at: new Date().toISOString(),
        };
        allUpdates.push(updateObj);

        // Prepare history insert
        allHistoryInserts.push({
          tournament_id,
          market_id: market.id,
          athlete_id: athleteId,
          discipline,
          category: market.category,
          old_rating: R_i,
          delta: Math.round(delta * 100) / 100,
          new_rating: Math.round(newRating * 100) / 100,
          k_factor: K,
          actual_score: Math.round(S_i * 1000) / 1000,
          expected_score: Math.round(E_i * 1000) / 1000,
          is_major,
        });
      }
    }

    // Batch update athletes
    for (const update of allUpdates) {
      const { error: updateError } = await supabase
        .from("athletes")
        .update(update)
        .eq("id", update.id);

      if (updateError) {
        console.error("Failed to update athlete:", update.id, updateError);
      }
    }

    // Batch insert rating history
    if (allHistoryInserts.length > 0) {
      const { error: historyError } = await supabase
        .from("rating_history")
        .insert(allHistoryInserts);

      if (historyError) {
        console.error("Failed to insert rating history:", historyError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        markets_processed: markets.length,
        athletes_updated: allUpdates.length,
        history_records: allHistoryInserts.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const error = err as Error;
    console.error("Error in update-ratings-from-results:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
