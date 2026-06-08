import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AuditLogEntry {
  actor_type: 'admin' | 'system';
  actor_id?: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  before_state?: any;
  after_state?: any;
  metadata?: Record<string, any>;
}

async function writeAuditLog(supabase: any, entry: AuditLogEntry): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      actor_type: entry.actor_type,
      actor_id: entry.actor_id || null,
      action_type: entry.action_type,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      before_state: entry.before_state || null,
      after_state: entry.after_state || null,
      metadata: entry.metadata || {},
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

const MIN_ATHLETES_FOR_MARKET = 4;
const MARKET_TYPES = ['WINNER', 'PODIUM', 'HIGHEST_SCORE'] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Admin-only guard
    {
      const _t = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
      if (!_t) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: { user: _u } } = await supabase.auth.getUser(_t);
      if (!_u) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: _r } = await supabase.from("user_roles").select("role").eq("user_id", _u.id).eq("role", "admin").maybeSingle();
      if (!_r) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }


    const { tournament_id, force = false } = await req.json();

    if (!tournament_id) {
      return new Response(
        JSON.stringify({ error: "tournament_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[AUTO-MARKETS] Processing tournament: ${tournament_id}, force=${force}`);

    // 1. Fetch tournament
    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select("id, name, status")
      .eq("id", tournament_id)
      .single();

    if (tournamentError || !tournament) {
      return new Response(
        JSON.stringify({ error: "Tournament not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch tournament entries with athlete data
    const { data: entries, error: entriesError } = await supabase
      .from("tournament_entries")
      .select(`
        athlete_id,
        discipline,
        athletes (
          id,
          name,
          gender,
          current_rating_slalom,
          current_rating_trick,
          current_rating_jump
        )
      `)
      .eq("tournament_id", tournament_id);

    if (entriesError) throw entriesError;
    if (!entries || entries.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: "No tournament entries found",
          markets_created: 0,
          skipped_groups: []
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[AUTO-MARKETS] Found ${entries.length} tournament entries`);

    // 3. Group entries by discipline + gender
    const groups = new Map<string, typeof entries>();
    for (const entry of entries) {
      const athlete = entry.athletes as any;
      if (!athlete) continue;
      
      const key = `${entry.discipline}-${athlete.gender}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(entry);
    }

    console.log(`[AUTO-MARKETS] Grouped into ${groups.size} discipline-gender combinations`);

    const marketsCreated: Array<{ id: string; discipline: string; gender: string; market_type: string }> = [];
    const skippedGroups: Array<{ group: string; reason: string }> = [];
    const oddsJobsScheduled: string[] = [];

    // 4. For each group with >= MIN_ATHLETES_FOR_MARKET, create markets
    for (const [key, groupEntries] of groups) {
      const [discipline, gender] = key.split('-');
      const category = gender === 'male' ? 'open_men' : 'open_women';

      // Check minimum athlete count
      const uniqueAthletes = new Set(groupEntries.map(e => e.athlete_id));
      if (uniqueAthletes.size < MIN_ATHLETES_FOR_MARKET) {
        skippedGroups.push({
          group: key,
          reason: `Only ${uniqueAthletes.size} athletes (minimum ${MIN_ATHLETES_FOR_MARKET} required)`
        });
        console.log(`[AUTO-MARKETS] Skipping ${key}: only ${uniqueAthletes.size} athletes`);
        continue;
      }

      // Create each market type
      for (const marketType of MARKET_TYPES) {
        // Check if market already exists
        const { data: existingMarket } = await supabase
          .from("markets")
          .select("id")
          .eq("tournament_id", tournament_id)
          .eq("discipline", discipline)
          .eq("category", category)
          .eq("market_type", marketType)
          .maybeSingle();

        if (existingMarket && !force) {
          console.log(`[AUTO-MARKETS] Market already exists: ${discipline} ${category} ${marketType}`);
          // Still schedule odds generation in case athletes were added
          oddsJobsScheduled.push(existingMarket.id);
          continue;
        }

        // Upsert market
        const { data: market, error: marketError } = await supabase
          .from("markets")
          .upsert({
            tournament_id,
            discipline,
            category,
            market_type: marketType,
            name: `${discipline} ${category} ${marketType.replace('_', ' ')}`,
          }, {
            onConflict: 'tournament_id,discipline,category,market_type',
            ignoreDuplicates: false
          })
          .select()
          .single();

        if (marketError) {
          console.error(`[AUTO-MARKETS] Failed to create market:`, marketError);
          continue;
        }

        console.log(`[AUTO-MARKETS] Created/updated market: ${market.id} (${marketType})`);

        // Create selections for each unique athlete
        const selectionsToUpsert = [];
        for (const athleteId of uniqueAthletes) {
          const entry = groupEntries.find(e => e.athlete_id === athleteId);
          const athlete = entry?.athletes as any;
          if (!athlete) continue;

          // Default placeholder odds (will be replaced by Monte Carlo)
          const placeholderOdds = 2.0;

          selectionsToUpsert.push({
            market_id: market.id,
            athlete_id: athleteId,
            description: `${athlete.name} - ${marketType.replace('_', ' ')}`,
            decimal_odds: placeholderOdds,
          });
        }

        if (selectionsToUpsert.length > 0) {
          const { error: selectionsError } = await supabase
            .from("selections")
            .upsert(selectionsToUpsert, {
              onConflict: 'market_id,athlete_id',
              ignoreDuplicates: false
            });

          if (selectionsError) {
            console.error(`[AUTO-MARKETS] Failed to create selections:`, selectionsError);
          } else {
            console.log(`[AUTO-MARKETS] Created ${selectionsToUpsert.length} selections for market ${market.id}`);
          }
        }

        marketsCreated.push({
          id: market.id,
          discipline,
          gender,
          market_type: marketType
        });

        oddsJobsScheduled.push(market.id);
      }
    }

    // 5. Run Monte Carlo for all affected markets immediately
    const oddsResults: Array<{ market_id: string; success: boolean; error?: string; implied_sum?: number }> = [];
    
    for (const marketId of [...new Set(oddsJobsScheduled)]) {
      try {
        console.log(`[AUTO-MARKETS] Generating odds for market: ${marketId}`);
        
        // Call generate-market-odds directly
        const { data: oddsData, error: oddsError } = await supabase.functions.invoke(
          'generate-market-odds',
          { body: { market_id: marketId }, headers: { 'x-internal-secret': Deno.env.get('INTERNAL_FN_SECRET') ?? '' } }
        );

        if (oddsError) {
          console.error(`[AUTO-MARKETS] Odds generation failed for ${marketId}:`, oddsError);
          oddsResults.push({ market_id: marketId, success: false, error: oddsError.message });
        } else {
          console.log(`[AUTO-MARKETS] Odds generated for ${marketId}: implied_sum=${oddsData?.actual_implied_sum}`);
          oddsResults.push({ 
            market_id: marketId, 
            success: true, 
            implied_sum: oddsData?.actual_implied_sum 
          });
        }
      } catch (err) {
        const error = err as Error;
        console.error(`[AUTO-MARKETS] Exception generating odds for ${marketId}:`, error);
        oddsResults.push({ market_id: marketId, success: false, error: error.message });
      }
    }

    // 6. Write audit log
    await writeAuditLog(supabase, {
      actor_type: 'system',
      action_type: 'MARKET_CREATED_AUTO',
      entity_type: 'tournament',
      entity_id: tournament_id,
      after_state: {
        markets_created: marketsCreated.length,
        skipped_groups_count: skippedGroups.length,
        odds_generated: oddsResults.filter(r => r.success).length,
      },
      metadata: {
        tournament_name: tournament.name,
        total_entries: entries.length,
        groups_processed: groups.size,
        markets_created: marketsCreated,
        skipped_groups: skippedGroups,
        odds_results: oddsResults,
      }
    });

    const successfulOdds = oddsResults.filter(r => r.success).length;
    console.log(`[AUTO-MARKETS] Complete. Created ${marketsCreated.length} markets, generated odds for ${successfulOdds} markets`);

    return new Response(
      JSON.stringify({
        success: true,
        tournament_id,
        tournament_name: tournament.name,
        markets_created: marketsCreated.length,
        odds_generated: successfulOdds,
        skipped_groups: skippedGroups,
        markets: marketsCreated,
        odds_results: oddsResults,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const error = err as Error;
    console.error("[AUTO-MARKETS] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
