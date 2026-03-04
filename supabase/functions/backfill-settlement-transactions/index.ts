import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { dryRun = true } = await req.json().catch(() => ({ dryRun: true }));

    console.log(`[backfill] Starting backfill (dryRun=${dryRun})`);

    // 1. Find all settled bet_slips missing settlement transactions
    const { data: missingSlips, error: fetchError } = await supabase
      .from("bet_slips")
      .select(`
        id, user_id, status, total_stake_tokens, actual_payout_tokens, 
        settled_at, type, tournament_id, market_id, athlete_id,
        total_odds_decimal,
        athletes:athlete_id (name),
        markets:market_id (discipline, market_type, name),
        tournaments:tournament_id (name)
      `)
      .in("status", ["WON", "LOST", "VOID"]);

    if (fetchError) throw new Error(`Failed to fetch bet_slips: ${fetchError.message}`);

    // 2. Get existing settlement transactions to exclude
    const { data: existingTxs, error: txError } = await supabase
      .from("token_transactions")
      .select("reference_id")
      .in("type", [
        "prediction_won", "prediction_lost", "prediction_void",
        "bet_won", "bet_lost", "bet_void"
      ]);

    if (txError) throw new Error(`Failed to fetch existing txs: ${txError.message}`);

    const existingRefIds = new Set((existingTxs || []).map(t => t.reference_id));

    const toBackfill = (missingSlips || []).filter(s => !existingRefIds.has(s.id));

    console.log(`[backfill] Found ${toBackfill.length} bet_slips missing settlement transactions`);

    if (toBackfill.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No missing transactions found", count: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 3. Build transaction records
    const transactions = toBackfill.map(slip => {
      const athleteName = (slip.athletes as any)?.name || "Unknown";
      const discipline = (slip.markets as any)?.discipline || "unknown";
      const marketType = (slip.markets as any)?.market_type || "WINNER";
      const tournamentName = (slip.tournaments as any)?.name || "Tournament";

      let type: string;
      let amount: number;
      let description: string;

      if (slip.status === "WON") {
        type = "prediction_won";
        amount = slip.actual_payout_tokens || 0;
        description = `Won prediction on ${athleteName} (${discipline}) - Won ${amount} tokens`;
      } else if (slip.status === "VOID") {
        type = "prediction_void";
        amount = slip.total_stake_tokens; // refund
        description = `Voided prediction on ${athleteName || 'parlay'} (${discipline}) - Refunded ${amount} tokens`;
      } else {
        // LOST
        type = "prediction_lost";
        amount = -slip.total_stake_tokens;
        description = `Lost prediction on ${athleteName} (${discipline}) - Lost ${slip.total_stake_tokens} tokens`;
      }

      return {
        user_id: slip.user_id,
        type,
        amount,
        balance_after: 0, // historical - can't reconstruct accurately
        reference_type: "prediction",
        reference_id: slip.id,
        description,
        tournament_id: slip.tournament_id,
        transaction_status: "completed",
        metadata: {
          backfilled: true,
          backfilled_at: new Date().toISOString(),
          athlete_name: athleteName,
          discipline,
          market_type: marketType,
          tournament_name: tournamentName,
          odds: slip.total_odds_decimal,
          staked: slip.total_stake_tokens,
          original_settled_at: slip.settled_at,
        },
        created_at: slip.settled_at, // Use original settlement time
      };
    });

    if (dryRun) {
      // Group summary by user
      const byUser: Record<string, { won: number; lost: number; void_count: number; net: number }> = {};
      for (const tx of transactions) {
        if (!byUser[tx.user_id]) byUser[tx.user_id] = { won: 0, lost: 0, void_count: 0, net: 0 };
        if (tx.type === "prediction_won") { byUser[tx.user_id].won++; byUser[tx.user_id].net += tx.amount; }
        else if (tx.type === "prediction_lost") { byUser[tx.user_id].lost++; byUser[tx.user_id].net += tx.amount; }
        else { byUser[tx.user_id].void_count++; byUser[tx.user_id].net += tx.amount; }
      }

      return new Response(
        JSON.stringify({
          success: true,
          dryRun: true,
          totalRecords: transactions.length,
          byUser,
          sampleRecords: transactions.slice(0, 5),
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 4. Insert in batches of 50
    let inserted = 0;
    const errors: string[] = [];
    const batchSize = 50;

    for (let i = 0; i < transactions.length; i += batchSize) {
      const batch = transactions.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from("token_transactions")
        .insert(batch);

      if (insertError) {
        console.error(`[backfill] Batch ${i / batchSize + 1} failed:`, insertError);
        errors.push(`Batch ${i / batchSize + 1}: ${insertError.message}`);
      } else {
        inserted += batch.length;
        console.log(`[backfill] Inserted batch ${i / batchSize + 1} (${batch.length} records)`);
      }
    }

    console.log(`[backfill] Complete: ${inserted} inserted, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        inserted,
        total: transactions.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("[backfill] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
