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

// Parlay house factor to ensure minimum 15% edge
const PARLAY_HOUSE_FACTOR = 0.85;

// Maximum parlays to generate per tournament
const MAX_2_LEG_PARLAYS = 30;
const MAX_3_LEG_PARLAYS = 20;

interface MarketOdds {
  market_id: string;
  athlete_id: string;
  athlete_name: string;
  market_type: string;
  discipline: string;
  final_decimal_odds: number;
}

interface ParlayLeg {
  market_id: string;
  athlete_id: string;
  athlete_name: string;
  market_type: string;
  discipline: string;
  multiplier: number;
}

/**
 * Generate 2-leg and 3-leg parlays from existing markets
 * Only allows legs from WINNER, PODIUM, HIGHEST_SCORE markets
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { tournament_id, force = false } = await req.json();

    if (!tournament_id) {
      return new Response(
        JSON.stringify({ error: "tournament_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[GENERATE-PARLAYS] Processing tournament: ${tournament_id}, force=${force}`);

    // Check for existing parlays
    if (!force) {
      const { data: existingParlays, error: existingError } = await supabase
        .from('parlay_markets')
        .select('id')
        .eq('tournament_id', tournament_id)
        .limit(1);

      if (existingParlays && existingParlays.length > 0) {
        return new Response(
          JSON.stringify({ 
            message: "Parlays already exist for this tournament. Use force=true to regenerate.",
            existing_count: existingParlays.length
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Delete existing parlays if force
    if (force) {
      await supabase
        .from('parlay_markets')
        .delete()
        .eq('tournament_id', tournament_id);
    }

    // 1. Get all markets with odds for this tournament
    const { data: markets, error: marketsError } = await supabase
      .from('markets')
      .select('id, market_type, discipline, category')
      .eq('tournament_id', tournament_id)
      .in('market_type', ['WINNER', 'PODIUM', 'HIGHEST_SCORE'])
      .is('locked_at', null);

    if (marketsError) throw marketsError;
    if (!markets || markets.length === 0) {
      return new Response(
        JSON.stringify({ error: "No eligible markets found", parlays_created: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[GENERATE-PARLAYS] Found ${markets.length} eligible markets`);

    // 2. Get market odds with athlete info
    const marketIds = markets.map(m => m.id);
    const { data: oddsData, error: oddsError } = await supabase
      .from('market_odds')
      .select(`
        market_id,
        athlete_id,
        final_decimal_odds,
        athletes (
          id,
          name
        )
      `)
      .in('market_id', marketIds);

    if (oddsError) throw oddsError;
    if (!oddsData || oddsData.length === 0) {
      return new Response(
        JSON.stringify({ error: "No odds found for markets", parlays_created: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build odds lookup
    const oddsLookup: MarketOdds[] = oddsData.map(o => {
      const market = markets.find(m => m.id === o.market_id);
      const athlete = o.athletes as any;
      return {
        market_id: o.market_id,
        athlete_id: o.athlete_id,
        athlete_name: athlete?.name || 'Unknown',
        market_type: market?.market_type || 'UNKNOWN',
        discipline: market?.discipline || 'unknown',
        final_decimal_odds: o.final_decimal_odds
      };
    });

    console.log(`[GENERATE-PARLAYS] Processing ${oddsLookup.length} selection options`);

    // 3. Generate 2-leg parlays (different disciplines only)
    const twoLegParlays: Array<{
      legs: ParlayLeg[];
      combined_multiplier: number;
      final_multiplier: number;
    }> = [];

    // Group by discipline to avoid same-discipline parlays
    const byDiscipline = new Map<string, MarketOdds[]>();
    for (const odds of oddsLookup) {
      const key = odds.discipline;
      if (!byDiscipline.has(key)) {
        byDiscipline.set(key, []);
      }
      byDiscipline.get(key)!.push(odds);
    }

    const disciplines = Array.from(byDiscipline.keys());

    // Generate cross-discipline 2-leg parlays
    for (let i = 0; i < disciplines.length; i++) {
      for (let j = i + 1; j < disciplines.length; j++) {
        const disc1Odds = byDiscipline.get(disciplines[i])!;
        const disc2Odds = byDiscipline.get(disciplines[j])!;

        // Take top 5 from each discipline (by lowest odds = favorites)
        const top1 = disc1Odds.sort((a, b) => a.final_decimal_odds - b.final_decimal_odds).slice(0, 5);
        const top2 = disc2Odds.sort((a, b) => a.final_decimal_odds - b.final_decimal_odds).slice(0, 5);

        for (const leg1 of top1) {
          for (const leg2 of top2) {
            const combined = leg1.final_decimal_odds * leg2.final_decimal_odds;
            const final = combined * PARLAY_HOUSE_FACTOR;

            twoLegParlays.push({
              legs: [
                { ...leg1, multiplier: leg1.final_decimal_odds },
                { ...leg2, multiplier: leg2.final_decimal_odds }
              ],
              combined_multiplier: combined,
              final_multiplier: final
            });
          }
        }
      }
    }

    // Sort by final multiplier and take top N
    const selected2Leg = twoLegParlays
      .sort((a, b) => a.final_multiplier - b.final_multiplier)
      .slice(0, MAX_2_LEG_PARLAYS);

    console.log(`[GENERATE-PARLAYS] Generated ${selected2Leg.length} 2-leg parlays`);

    // 4. Generate 3-leg parlays (all different disciplines)
    const threeLegParlays: Array<{
      legs: ParlayLeg[];
      combined_multiplier: number;
      final_multiplier: number;
    }> = [];

    if (disciplines.length >= 3) {
      for (let i = 0; i < disciplines.length; i++) {
        for (let j = i + 1; j < disciplines.length; j++) {
          for (let k = j + 1; k < disciplines.length; k++) {
            const disc1Odds = byDiscipline.get(disciplines[i])!;
            const disc2Odds = byDiscipline.get(disciplines[j])!;
            const disc3Odds = byDiscipline.get(disciplines[k])!;

            // Take top 3 favorites from each
            const top1 = disc1Odds.sort((a, b) => a.final_decimal_odds - b.final_decimal_odds).slice(0, 3);
            const top2 = disc2Odds.sort((a, b) => a.final_decimal_odds - b.final_decimal_odds).slice(0, 3);
            const top3 = disc3Odds.sort((a, b) => a.final_decimal_odds - b.final_decimal_odds).slice(0, 3);

            for (const leg1 of top1) {
              for (const leg2 of top2) {
                for (const leg3 of top3) {
                  const combined = leg1.final_decimal_odds * leg2.final_decimal_odds * leg3.final_decimal_odds;
                  const final = combined * PARLAY_HOUSE_FACTOR;

                  threeLegParlays.push({
                    legs: [
                      { ...leg1, multiplier: leg1.final_decimal_odds },
                      { ...leg2, multiplier: leg2.final_decimal_odds },
                      { ...leg3, multiplier: leg3.final_decimal_odds }
                    ],
                    combined_multiplier: combined,
                    final_multiplier: final
                  });
                }
              }
            }
          }
        }
      }
    }

    const selected3Leg = threeLegParlays
      .sort((a, b) => a.final_multiplier - b.final_multiplier)
      .slice(0, MAX_3_LEG_PARLAYS);

    console.log(`[GENERATE-PARLAYS] Generated ${selected3Leg.length} 3-leg parlays`);

    // 5. Insert parlays
    const parlaysToInsert = [
      ...selected2Leg.map(p => ({
        tournament_id,
        leg_count: 2,
        legs: p.legs.map(l => ({
          market_id: l.market_id,
          athlete_id: l.athlete_id,
          athlete_name: l.athlete_name,
          market_type: l.market_type,
          discipline: l.discipline,
          multiplier: l.multiplier
        })),
        combined_multiplier: p.combined_multiplier,
        house_factor: PARLAY_HOUSE_FACTOR,
        final_multiplier: p.final_multiplier,
        implied_probability: 1 / p.final_multiplier,
        status: 'OPEN'
      })),
      ...selected3Leg.map(p => ({
        tournament_id,
        leg_count: 3,
        legs: p.legs.map(l => ({
          market_id: l.market_id,
          athlete_id: l.athlete_id,
          athlete_name: l.athlete_name,
          market_type: l.market_type,
          discipline: l.discipline,
          multiplier: l.multiplier
        })),
        combined_multiplier: p.combined_multiplier,
        house_factor: PARLAY_HOUSE_FACTOR,
        final_multiplier: p.final_multiplier,
        implied_probability: 1 / p.final_multiplier,
        status: 'OPEN'
      }))
    ];

    if (parlaysToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('parlay_markets')
        .insert(parlaysToInsert);

      if (insertError) throw insertError;
    }

    // 6. Write audit log
    await writeAuditLog(supabase, {
      actor_type: 'system',
      action_type: 'PARLAY_GENERATED',
      entity_type: 'tournament',
      entity_id: tournament_id,
      after_state: {
        two_leg_count: selected2Leg.length,
        three_leg_count: selected3Leg.length,
        total_parlays: parlaysToInsert.length,
        house_factor: PARLAY_HOUSE_FACTOR
      },
      metadata: {
        disciplines: disciplines,
        total_selections_considered: oddsLookup.length
      }
    });

    console.log(`[GENERATE-PARLAYS] Complete. Created ${parlaysToInsert.length} parlays`);

    return new Response(
      JSON.stringify({
        success: true,
        tournament_id,
        parlays_created: parlaysToInsert.length,
        two_leg_parlays: selected2Leg.length,
        three_leg_parlays: selected3Leg.length,
        house_factor: PARLAY_HOUSE_FACTOR,
        disciplines_used: disciplines
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const error = err as Error;
    console.error("[GENERATE-PARLAYS] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
