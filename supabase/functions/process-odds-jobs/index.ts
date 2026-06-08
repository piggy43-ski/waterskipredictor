import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Process pending odds generation jobs
 * Called by cron every 2 minutes to handle debounced Monte Carlo runs
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date().toISOString();
    console.log(`[ODDS-JOBS] Processing jobs at ${now}`);

    // 1. Get all pending jobs scheduled for now or earlier (max 10 per run)
    const { data: jobs, error: jobsError } = await supabase
      .from('odds_generation_jobs')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true })
      .limit(10);

    if (jobsError) throw jobsError;

    if (!jobs || jobs.length === 0) {
      console.log('[ODDS-JOBS] No pending jobs to process');
      return new Response(
        JSON.stringify({ message: 'No pending jobs', processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ODDS-JOBS] Found ${jobs.length} pending jobs`);

    const results: Array<{ job_id: string; market_id: string; success: boolean; error?: string; implied_sum?: number }> = [];

    for (const job of jobs) {
      console.log(`[ODDS-JOBS] Processing job ${job.id} for market ${job.market_id}`);

      // 2. Mark as running
      const { error: updateRunningError } = await supabase
        .from('odds_generation_jobs')
        .update({ 
          status: 'running', 
          started_at: new Date().toISOString() 
        })
        .eq('id', job.id);

      if (updateRunningError) {
        console.error(`[ODDS-JOBS] Failed to mark job running:`, updateRunningError);
        continue;
      }

      try {
        // 3. Run Monte Carlo via generate-market-odds function
        const { data: oddsData, error: oddsError } = await supabase.functions.invoke(
          'generate-market-odds',
          { body: { market_id: job.market_id }, headers: { 'x-internal-secret': Deno.env.get('INTERNAL_FN_SECRET') ?? '' } }
        );

        if (oddsError) {
          throw new Error(oddsError.message || 'Odds generation failed');
        }

        // 4. Mark completed
        await supabase
          .from('odds_generation_jobs')
          .update({ 
            status: 'completed', 
            completed_at: new Date().toISOString(),
            result: oddsData 
          })
          .eq('id', job.id);

        console.log(`[ODDS-JOBS] Job ${job.id} completed: implied_sum=${oddsData?.actual_implied_sum}`);
        results.push({ 
          job_id: job.id, 
          market_id: job.market_id, 
          success: true,
          implied_sum: oddsData?.actual_implied_sum
        });

      } catch (err) {
        const error = err as Error;
        console.error(`[ODDS-JOBS] Job ${job.id} failed:`, error);

        // Mark failed
        await supabase
          .from('odds_generation_jobs')
          .update({ 
            status: 'failed', 
            completed_at: new Date().toISOString(),
            error: error.message 
          })
          .eq('id', job.id);

        results.push({ 
          job_id: job.id, 
          market_id: job.market_id, 
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[ODDS-JOBS] Processed ${jobs.length} jobs, ${successCount} successful`);

    return new Response(
      JSON.stringify({
        processed: jobs.length,
        successful: successCount,
        failed: jobs.length - successCount,
        results
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const error = err as Error;
    console.error("[ODDS-JOBS] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
