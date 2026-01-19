import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Schedule odds refresh based on event proximity
 * Called by cron once per day to schedule Monte Carlo runs at appropriate intervals
 * 
 * Refresh intervals:
 * - Events > 7 days away: daily refresh
 * - Events within 7 days: every 6 hours
 * - Events within 24 hours: every hour
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    console.log(`[SCHEDULE-REFRESH] Running at ${now.toISOString()}`);

    // 1. Fetch upcoming tournaments with unlocked markets
    const { data: tournaments, error: tournamentsError } = await supabase
      .from('tournaments')
      .select('id, name, start_date, status')
      .in('status', ['upcoming', 'live'])
      .order('start_date', { ascending: true });

    if (tournamentsError) throw tournamentsError;

    if (!tournaments || tournaments.length === 0) {
      console.log('[SCHEDULE-REFRESH] No upcoming tournaments');
      return new Response(
        JSON.stringify({ message: 'No upcoming tournaments', scheduled: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[SCHEDULE-REFRESH] Found ${tournaments.length} tournaments`);

    let totalJobsScheduled = 0;
    const scheduledByTournament: Array<{ tournament_id: string; name: string; interval_hours: number; markets_scheduled: number }> = [];

    for (const tournament of tournaments) {
      // Calculate days until event
      const eventStart = tournament.start_date 
        ? new Date(tournament.start_date + 'T00:00:00Z')
        : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // Default to 7 days if no date
      
      const msUntil = eventStart.getTime() - now.getTime();
      const daysUntil = msUntil / (1000 * 60 * 60 * 24);

      // Determine refresh interval based on proximity
      let intervalHours: number;
      if (daysUntil <= 1) {
        intervalHours = 1;  // Hourly for events within 24h
      } else if (daysUntil <= 7) {
        intervalHours = 6;  // Every 6 hours for events within 7 days
      } else {
        intervalHours = 24; // Daily for events > 7 days away
      }

      console.log(`[SCHEDULE-REFRESH] Tournament "${tournament.name}": ${daysUntil.toFixed(1)} days away, interval=${intervalHours}h`);

      // 2. Get all open markets for this tournament
      const { data: markets, error: marketsError } = await supabase
        .from('markets')
        .select('id')
        .eq('tournament_id', tournament.id)
        .is('locked_at', null);

      if (marketsError) {
        console.error(`[SCHEDULE-REFRESH] Failed to fetch markets for ${tournament.id}:`, marketsError);
        continue;
      }

      if (!markets || markets.length === 0) {
        console.log(`[SCHEDULE-REFRESH] No open markets for "${tournament.name}"`);
        continue;
      }

      let marketsScheduled = 0;

      for (const market of markets) {
        // Calculate next scheduled run time
        const scheduledFor = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);

        // Insert job (unique constraint prevents duplicates)
        const { error: insertError } = await supabase
          .from('odds_generation_jobs')
          .insert({
            market_id: market.id,
            triggered_by: 'schedule',
            scheduled_for: scheduledFor.toISOString()
          });

        // Ignore duplicate key errors (job already scheduled)
        if (insertError && !insertError.message.includes('duplicate')) {
          console.error(`[SCHEDULE-REFRESH] Failed to schedule job for market ${market.id}:`, insertError);
        } else if (!insertError) {
          marketsScheduled++;
          totalJobsScheduled++;
        }
      }

      if (marketsScheduled > 0) {
        scheduledByTournament.push({
          tournament_id: tournament.id,
          name: tournament.name,
          interval_hours: intervalHours,
          markets_scheduled: marketsScheduled
        });
      }
    }

    console.log(`[SCHEDULE-REFRESH] Scheduled ${totalJobsScheduled} jobs across ${scheduledByTournament.length} tournaments`);

    return new Response(
      JSON.stringify({
        success: true,
        tournaments_processed: tournaments.length,
        jobs_scheduled: totalJobsScheduled,
        details: scheduledByTournament
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const error = err as Error;
    console.error("[SCHEDULE-REFRESH] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
