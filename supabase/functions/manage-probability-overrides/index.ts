import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// SINGLE SOURCE OF TRUTH: mirrors src/utils/multiplierCaps.ts
// Do NOT diverge — update src/utils/multiplierCaps.ts AND this block in lockstep.
const MULTIPLIER_CAPS = {
  WINNER: { min: 1.50, max: 8.0 },
  PODIUM: { min: 1.25, max: 6.0 },
  HIGHEST_SCORE: { min: 1.50, max: 7.0 },
};

const TARGET_IMPLIED_SUM = {
  WINNER: { min: 0.90, max: 0.92 },
  PODIUM: { min: 0.84, max: 0.86 },
  HIGHEST_SCORE: { min: 0.87, max: 0.89 },
};

interface ProbabilityOverride {
  athlete_id: string;
  athlete_name: string;
  field_rank: number;
  p_auto: number;
  p_manual: number | null;
  p_final: number;
  multiplier_preview: number;
  source: 'auto' | 'manual';
  override_id: string | null;
  reason: string | null;
}

interface OverrideMetrics {
  implied_sum: number;
  implied_sum_pct: string;
  status: 'OK' | 'WARNING' | 'BLOCKED';
  target_band: { min: number; max: number };
  target_band_pct: string;
  total_athletes: number;
  manual_count: number;
  probability_sum: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function getImpliedSumStatus(impliedSum: number, marketType: string): 'OK' | 'WARNING' | 'BLOCKED' {
  const band = TARGET_IMPLIED_SUM[marketType as keyof typeof TARGET_IMPLIED_SUM] || TARGET_IMPLIED_SUM.WINNER;
  const tolerance = 0.02;
  
  if (impliedSum >= band.min && impliedSum <= band.max) {
    return 'OK';
  }
  if (impliedSum >= band.min - tolerance && impliedSum <= band.max + tolerance) {
    return 'WARNING';
  }
  return 'BLOCKED';
}

function calculateMultiplierFromProbability(probability: number, marketType: string, edgeFactor: number): number {
  const caps = MULTIPLIER_CAPS[marketType as keyof typeof MULTIPLIER_CAPS] || MULTIPLIER_CAPS.WINNER;
  const p_adj = probability * edgeFactor;
  if (p_adj <= 0) return caps.max;
  let m = 1 / p_adj;
  return clamp(m, caps.min, caps.max);
}

function normalize(arr: number[]): number[] {
  const sum = arr.reduce((a, b) => a + b, 0);
  return sum > 0 ? arr.map(v => v / sum) : arr.map(() => 1 / arr.length);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth check
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), 
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), 
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();
    
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), 
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { action, market_id, athlete_id, manual_probability, reason, auto_normalize } = body;

    console.log(`[PROB-OVERRIDE] Action: ${action}, Market: ${market_id || body.winner_market_id || 'N/A'}`);

    // ===== ACTION: CASCADE_FROM_WINNER - Handle before market lookup =====
    // This action uses winner_market_id instead of market_id
    if (action === 'cascade_from_winner') {
      const { winner_market_id, podium_market_id, highest_market_id } = body;
      
      if (!winner_market_id) {
        return new Response(JSON.stringify({ error: "winner_market_id required" }), 
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Fetch WINNER probabilities (from overrides or market_odds)
      const { data: winnerOdds } = await supabase
        .from('market_odds')
        .select('athlete_id, blended_probability, normalized_probability')
        .eq('market_id', winner_market_id);

      const { data: winnerOverrides } = await supabase
        .from('market_probability_overrides')
        .select('athlete_id, manual_probability')
        .eq('market_id', winner_market_id)
        .eq('is_enabled', true);

      const overrideMap = new Map(winnerOverrides?.map(o => [o.athlete_id, o.manual_probability]) || []);

      // Build final winner probabilities
      const winnerProbs = (winnerOdds || []).map(o => ({
        athlete_id: o.athlete_id,
        p_winner: overrideMap.get(o.athlete_id) ?? o.blended_probability ?? o.normalized_probability ?? 0
      }));

      // Cascade formulas
      const cascadeToPodium = (pWinner: number) => Math.min(0.90, Math.max(0.05, 1 - Math.pow(1 - pWinner, 2.2)));
      const cascadeToHighest = (pWinner: number) => Math.min(0.50, Math.max(0.01, Math.pow(pWinner, 0.85)));

      let podiumCount = 0;
      let highestCount = 0;

      // Cascade to PODIUM market
      if (podium_market_id) {
        for (const wp of winnerProbs) {
          const pPodium = cascadeToPodium(wp.p_winner);
          
          await supabase.from('market_probability_overrides').upsert({
            market_id: podium_market_id,
            athlete_id: wp.athlete_id,
            manual_probability: pPodium,
            is_enabled: true,
            is_cascaded: true,
            created_by: user.id,
            updated_at: new Date().toISOString()
          }, { onConflict: 'market_id,athlete_id' });
          
          podiumCount++;
        }
      }

      // Cascade to HIGHEST_SCORE market
      if (highest_market_id) {
        for (const wp of winnerProbs) {
          const pHighest = cascadeToHighest(wp.p_winner);
          
          await supabase.from('market_probability_overrides').upsert({
            market_id: highest_market_id,
            athlete_id: wp.athlete_id,
            manual_probability: pHighest,
            is_enabled: true,
            is_cascaded: true,
            created_by: user.id,
            updated_at: new Date().toISOString()
          }, { onConflict: 'market_id,athlete_id' });
          
          highestCount++;
        }
      }

      // Audit log
      await supabase.from('audit_logs').insert({
        event_type: 'PROBABILITY_CASCADED',
        user_id: user.id,
        target_type: 'market',
        target_id: winner_market_id,
        payload: {
          winner_market_id,
          podium_market_id,
          highest_market_id,
          podium_count: podiumCount,
          highest_count: highestCount
        }
      });

      console.log(`[PROB-OVERRIDE] Cascaded ${podiumCount} to PODIUM, ${highestCount} to HIGHEST`);

      return new Response(JSON.stringify({ 
        success: true, 
        podium_count: podiumCount,
        highest_count: highestCount
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // For all other actions, market_id is required
    if (!market_id) {
      return new Response(JSON.stringify({ error: "market_id required" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch market info
    const { data: market } = await supabase
      .from('markets')
      .select('id, market_type, discipline, category, tournament_id')
      .eq('id', market_id)
      .single();

    if (!market) {
      return new Response(JSON.stringify({ error: "Market not found" }), 
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const marketType = (market.market_type || 'WINNER').toUpperCase();
    const targetBand = TARGET_IMPLIED_SUM[marketType as keyof typeof TARGET_IMPLIED_SUM] || TARGET_IMPLIED_SUM.WINNER;
    const edgeFactor = (targetBand.min + targetBand.max) / 2;

    // ===== ACTION: LIST =====
    if (action === 'list') {
      // Fetch market_odds for auto probabilities
      const { data: odds } = await supabase
        .from('market_odds')
        .select(`
          athlete_id,
          normalized_probability,
          blended_probability,
          field_rank,
          multiplier,
          athletes!inner(id, name)
        `)
        .eq('market_id', market_id)
        .order('field_rank', { ascending: true });

      // Fetch existing overrides
      const { data: overrides } = await supabase
        .from('market_probability_overrides')
        .select('id, athlete_id, manual_probability, is_enabled, reason')
        .eq('market_id', market_id);

      const overrideMap = new Map(overrides?.map(o => [o.athlete_id, o]) || []);

      // Build athlete list with probabilities
      const athletes: ProbabilityOverride[] = (odds || []).map((o: any) => {
        const override = overrideMap.get(o.athlete_id);
        const p_auto = o.blended_probability || o.normalized_probability || 0;
        const p_manual = override?.is_enabled ? override.manual_probability : null;
        const p_final = p_manual ?? p_auto;
        
        return {
          athlete_id: o.athlete_id,
          athlete_name: o.athletes?.name || 'Unknown',
          field_rank: o.field_rank || 0,
          p_auto,
          p_manual,
          p_final,
          multiplier_preview: calculateMultiplierFromProbability(p_final, marketType, edgeFactor),
          source: p_manual !== null ? 'manual' as const : 'auto' as const,
          override_id: override?.id || null,
          reason: override?.reason || null
        };
      });

      // Calculate metrics
      const probSum = athletes.reduce((s, a) => s + a.p_final, 0);
      const impliedSum = athletes.reduce((s, a) => s + (1 / a.multiplier_preview), 0);
      const manualCount = athletes.filter(a => a.source === 'manual').length;

      const metrics: OverrideMetrics = {
        implied_sum: impliedSum,
        implied_sum_pct: `${(impliedSum * 100).toFixed(1)}%`,
        status: getImpliedSumStatus(impliedSum, marketType),
        target_band: targetBand,
        target_band_pct: `${(targetBand.min * 100).toFixed(0)}% - ${(targetBand.max * 100).toFixed(0)}%`,
        total_athletes: athletes.length,
        manual_count: manualCount,
        probability_sum: probSum
      };

      return new Response(JSON.stringify({
        success: true,
        market: { id: market.id, type: marketType },
        athletes,
        metrics,
        caps: MULTIPLIER_CAPS[marketType as keyof typeof MULTIPLIER_CAPS] || MULTIPLIER_CAPS.WINNER
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== ACTION: UPSERT =====
    if (action === 'upsert') {
      if (!athlete_id || manual_probability === undefined) {
        return new Response(JSON.stringify({ error: "athlete_id and manual_probability required" }), 
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Validate probability range (0 < p < 1)
      const prob = parseFloat(manual_probability);
      if (isNaN(prob) || prob <= 0 || prob >= 1) {
        return new Response(JSON.stringify({ error: "Probability must be between 0 and 1 (exclusive)" }), 
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Get before state for audit
      const { data: existing } = await supabase
        .from('market_probability_overrides')
        .select('*')
        .eq('market_id', market_id)
        .eq('athlete_id', athlete_id)
        .single();

      // Upsert
      const { data: upserted, error: upsertError } = await supabase
        .from('market_probability_overrides')
        .upsert({
          market_id,
          athlete_id,
          manual_probability: prob,
          is_enabled: true,
          reason: reason || null,
          created_by: user.id,
          updated_at: new Date().toISOString()
        }, { onConflict: 'market_id,athlete_id' })
        .select()
        .single();

      if (upsertError) {
        console.error('[PROB-OVERRIDE] Upsert error:', upsertError);
        return new Response(JSON.stringify({ error: upsertError.message }), 
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Fetch athlete name for audit
      const { data: athlete } = await supabase
        .from('athletes')
        .select('name')
        .eq('id', athlete_id)
        .single();

      // Audit log
      await supabase.from('audit_logs').insert({
        event_type: 'PROBABILITY_OVERRIDDEN',
        user_id: user.id,
        target_type: 'market_probability_override',
        target_id: upserted.id,
        payload: {
          market_id,
          athlete_id,
          athlete_name: athlete?.name,
          market_type: marketType,
          before: existing ? { probability: existing.manual_probability, enabled: existing.is_enabled } : null,
          after: { probability: prob, enabled: true },
          reason: reason || null
        }
      });

      console.log(`[PROB-OVERRIDE] Upserted probability ${prob} for athlete ${athlete_id}`);

      return new Response(JSON.stringify({
        success: true,
        override: upserted
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== ACTION: DELETE =====
    if (action === 'delete') {
      if (!athlete_id) {
        return new Response(JSON.stringify({ error: "athlete_id required" }), 
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Get before state
      const { data: existing } = await supabase
        .from('market_probability_overrides')
        .select('*')
        .eq('market_id', market_id)
        .eq('athlete_id', athlete_id)
        .single();

      if (existing) {
        await supabase
          .from('market_probability_overrides')
          .delete()
          .eq('id', existing.id);

        // Audit log
        await supabase.from('audit_logs').insert({
          event_type: 'PROBABILITY_OVERRIDE_DELETED',
          user_id: user.id,
          target_type: 'market_probability_override',
          target_id: existing.id,
          payload: {
            market_id,
            athlete_id,
            deleted_probability: existing.manual_probability
          }
        });
      }

      return new Response(JSON.stringify({ success: true }), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== ACTION: BULK_NORMALIZE =====
    if (action === 'bulk_normalize') {
      // Fetch all current probabilities (manual or auto)
      const { data: odds } = await supabase
        .from('market_odds')
        .select('athlete_id, blended_probability, normalized_probability')
        .eq('market_id', market_id);

      const { data: overrides } = await supabase
        .from('market_probability_overrides')
        .select('athlete_id, manual_probability, is_enabled')
        .eq('market_id', market_id)
        .eq('is_enabled', true);

      const overrideMap = new Map(overrides?.map(o => [o.athlete_id, o.manual_probability]) || []);

      // Build current probabilities
      const currentProbs = (odds || []).map(o => ({
        athlete_id: o.athlete_id,
        prob: overrideMap.get(o.athlete_id) ?? o.blended_probability ?? o.normalized_probability ?? 0
      }));

      // Normalize
      const normalized = normalize(currentProbs.map(p => p.prob));

      // Upsert all as overrides
      for (let i = 0; i < currentProbs.length; i++) {
        await supabase.from('market_probability_overrides').upsert({
          market_id,
          athlete_id: currentProbs[i].athlete_id,
          manual_probability: normalized[i],
          is_enabled: true,
          created_by: user.id,
          updated_at: new Date().toISOString()
        }, { onConflict: 'market_id,athlete_id' });
      }

      await supabase.from('audit_logs').insert({
        event_type: 'PROBABILITY_BULK_NORMALIZED',
        user_id: user.id,
        target_type: 'market',
        target_id: market_id,
        payload: { athlete_count: currentProbs.length }
      });

      return new Response(JSON.stringify({ success: true, normalized_count: currentProbs.length }), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== ACTION: BULK_RESET =====
    if (action === 'bulk_reset') {
      const { data: deleted } = await supabase
        .from('market_probability_overrides')
        .delete()
        .eq('market_id', market_id)
        .select('id');

      await supabase.from('audit_logs').insert({
        event_type: 'PROBABILITY_BULK_RESET',
        user_id: user.id,
        target_type: 'market',
        target_id: market_id,
        payload: { deleted_count: deleted?.length || 0 }
      });

      return new Response(JSON.stringify({ success: true, deleted_count: deleted?.length || 0 }), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== ACTION: APPLY =====
    // After setting manual probabilities, regenerate odds
    if (action === 'apply') {
      // Invoke generate-market-odds to recalculate multipliers from probabilities
      const { error: invokeError } = await supabase.functions.invoke('generate-market-odds', {
        body: { market_id, force: true }
      });

      if (invokeError) {
        console.error('[PROB-OVERRIDE] Apply error:', invokeError);
        return new Response(JSON.stringify({ error: invokeError.message }), 
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ success: true, message: 'Odds regenerated with manual probabilities' }), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // cascade_from_winner is now handled at the top of the function

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), 
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[PROB-OVERRIDE] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
