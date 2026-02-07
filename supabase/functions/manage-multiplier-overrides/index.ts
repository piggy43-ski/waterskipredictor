import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Multiplier caps per market type - SYNCED with generate-market-odds
const MULTIPLIER_CAPS: Record<string, { min: number; max: number }> = {
  WINNER: { min: 1.8, max: 12.0 },
  PODIUM: { min: 1.4, max: 10.0 },
  HIGHEST_SCORE: { min: 2.0, max: 8.0 },
  HEAD_TO_HEAD: { min: 1.5, max: 5.0 },
  OVER_UNDER: { min: 1.5, max: 5.0 },
};

// Target implied sum bands per market type
const TARGET_IMPLIED_SUM: Record<string, { min: number; max: number }> = {
  WINNER: { min: 0.90, max: 0.92 },
  PODIUM: { min: 0.84, max: 0.86 },
  HIGHEST_SCORE: { min: 0.87, max: 0.89 },
  HEAD_TO_HEAD: { min: 0.95, max: 1.0 },
  OVER_UNDER: { min: 0.95, max: 1.0 },
};

interface RequestBody {
  action: 'list' | 'upsert' | 'delete' | 'bulk_copy' | 'bulk_reset' | 'bulk_disable' | 'repair_auto' | 'clear_and_regenerate';
  market_id: string;
  athlete_id?: string;
  manual_multiplier?: number;
  reason?: string;
  is_enabled?: boolean;
  enforce_monotonic?: boolean;
  overrides?: Array<{ athlete_id: string; manual_multiplier: number; reason?: string }>;
}

function calculateImpliedSum(multipliers: number[]): number {
  if (multipliers.length === 0) return 0;
  return multipliers.reduce((sum, m) => sum + (1 / m), 0);
}

function getImpliedSumStatus(impliedSum: number, marketType: string): 'OK' | 'CALIBRATED' | 'WARNING' | 'NEEDS_REVIEW' {
  const band = TARGET_IMPLIED_SUM[marketType];
  if (!band) return 'WARNING';
  
  // Within target band = CALIBRATED (success)
  if (impliedSum >= band.min && impliedSum <= band.max) return 'CALIBRATED';
  
  // Within 5% tolerance = WARNING (close enough)
  const tolerance = 0.05;
  if (impliedSum >= band.min * (1 - tolerance) && impliedSum <= band.max * (1 + tolerance)) {
    return 'WARNING';
  }
  
  // Outside tolerance = NEEDS_REVIEW
  return 'NEEDS_REVIEW';
}

function roundToStep(value: number, step: number = 0.05): number {
  return Math.round(value / step) * step;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body: RequestBody = await req.json();
    const { action, market_id } = body;

    if (!market_id) {
      return new Response(JSON.stringify({ error: 'market_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch market info
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('id, market_type, name, discipline, category, tournament_id')
      .eq('id', market_id)
      .single();

    if (marketError || !market) {
      return new Response(JSON.stringify({ error: 'Market not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const marketType = market.market_type as string;
    const caps = MULTIPLIER_CAPS[marketType] || { min: 1.5, max: 20.0 };

    // Fetch current selections with athlete info
    const { data: selections } = await supabase
      .from('selections')
      .select(`
        id,
        market_id,
        athlete_id,
        decimal_odds,
        athlete:athletes(id, name, gender, country)
      `)
      .eq('market_id', market_id);

    // Fetch market_odds to get TRUE auto-generated multipliers
    const { data: marketOdds } = await supabase
      .from('market_odds')
      .select('athlete_id, final_decimal_odds')
      .eq('market_id', market_id);
    
    const autoOddsMap = new Map(marketOdds?.map(o => [o.athlete_id, o.final_decimal_odds]) || []);

    // Fetch tournament entries for ranks
    const { data: entries } = await supabase
      .from('tournament_entries')
      .select('athlete_id, entry_rank, discipline_rank, seed_rank')
      .eq('tournament_id', market.tournament_id)
      .eq('discipline', market.discipline);

    const rankMap = new Map(entries?.map(e => [
      e.athlete_id, 
      e.discipline_rank || e.entry_rank || e.seed_rank || 999
    ]) || []);

    // Fetch existing overrides
    const { data: existingOverrides } = await supabase
      .from('market_multiplier_overrides')
      .select('*')
      .eq('market_id', market_id);

    const overrideMap = new Map(existingOverrides?.map(o => [o.athlete_id, o]) || []);

    // Helper to get user profile for audit log
    const createdBy = user.id;

    // Build athlete data with final multipliers
    // CRITICAL FIX: auto_multiplier comes from market_odds, NOT selections.decimal_odds
    const buildAthleteData = () => {
      return (selections || []).map(s => {
        const override = overrideMap.get(s.athlete_id);
        // AUTO multiplier comes from market_odds (engine output), fallback to selections only if no market_odds
        const autoMultiplier = autoOddsMap.get(s.athlete_id) || s.decimal_odds || 2.0;
        const finalMultiplier = (override?.is_enabled && override?.manual_multiplier)
          ? override.manual_multiplier
          : autoMultiplier;
        
        return {
          athlete_id: s.athlete_id,
          athlete_name: (s.athlete as any)?.name || 'Unknown',
          rank: rankMap.get(s.athlete_id) || 999,
          auto_multiplier: autoMultiplier,
          manual_multiplier: override?.manual_multiplier || null,
          final_multiplier: finalMultiplier,
          source: (override?.is_enabled && override?.manual_multiplier) ? 'manual' : 'auto',
          is_enabled: override?.is_enabled ?? false,
          override_id: override?.id || null,
          reason: override?.reason || null
        };
      }).sort((a, b) => a.rank - b.rank);
    };

    // Calculate metrics
    const calculateMetrics = (athletes: ReturnType<typeof buildAthleteData>) => {
      const multipliers = athletes.map(a => a.final_multiplier);
      const impliedSum = calculateImpliedSum(multipliers);
      const status = getImpliedSumStatus(impliedSum, marketType);
      const band = TARGET_IMPLIED_SUM[marketType] || { min: 0.9, max: 1.0 };
      
      // Also calculate auto implied sum (if we disabled all overrides)
      const autoMultipliers = athletes.map(a => a.auto_multiplier);
      const autoImpliedSum = calculateImpliedSum(autoMultipliers);
      const autoStatus = getImpliedSumStatus(autoImpliedSum, marketType);
      
      return {
        implied_sum: impliedSum,
        implied_sum_pct: (impliedSum * 100).toFixed(2),
        status,
        target_band: band,
        target_band_pct: `${(band.min * 100).toFixed(1)}%–${(band.max * 100).toFixed(1)}%`,
        total_athletes: athletes.length,
        manual_count: athletes.filter(a => a.source === 'manual').length,
        // NEW: auto-only metrics
        auto_implied_sum: autoImpliedSum,
        auto_implied_sum_pct: (autoImpliedSum * 100).toFixed(2),
        auto_status: autoStatus,
        // NEW: diagnostics
        overrides_causing_issue: status !== 'CALIBRATED' && autoStatus === 'CALIBRATED'
      };
    };

    // Audit logging helper
    const logAudit = async (
      actionType: string,
      entityId: string,
      beforeState: any,
      afterState: any,
      metadata: any
    ) => {
      await supabase.from('audit_logs').insert({
        action_type: actionType,
        entity_type: 'market_multiplier_override',
        entity_id: entityId,
        actor_type: 'admin',
        actor_id: user.id,
        before_state: beforeState,
        after_state: afterState,
        metadata
      });
    };

    // Handle different actions
    switch (action) {
      case 'list': {
        const athletes = buildAthleteData();
        const metrics = calculateMetrics(athletes);
        
        return new Response(JSON.stringify({
          success: true,
          market,
          athletes,
          metrics,
          caps
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'upsert': {
        const { athlete_id, manual_multiplier, reason, is_enabled = true, enforce_monotonic } = body;
        
        if (!athlete_id || manual_multiplier === undefined) {
          return new Response(JSON.stringify({ error: 'athlete_id and manual_multiplier required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Validate against caps
        const clampedMultiplier = Math.max(caps.min, Math.min(caps.max, manual_multiplier));
        const roundedMultiplier = roundToStep(clampedMultiplier);
        
        if (manual_multiplier < caps.min || manual_multiplier > caps.max) {
          console.log(`[OVERRIDE] Clamped ${manual_multiplier} to ${roundedMultiplier} for ${marketType}`);
        }

        // Check monotonic if enabled
        if (enforce_monotonic) {
          const athleteRank = rankMap.get(athlete_id) || 999;
          const athletes = buildAthleteData();
          
          for (const a of athletes) {
            if (a.athlete_id === athlete_id) continue;
            
            // Better rank should have lower or equal multiplier
            if (a.rank < athleteRank && roundedMultiplier < a.final_multiplier) {
              return new Response(JSON.stringify({
                error: `Monotonic violation: Rank #${athleteRank} (${roundedMultiplier}x) would be lower than Rank #${a.rank} (${a.final_multiplier}x)`
              }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }
            if (a.rank > athleteRank && roundedMultiplier > a.final_multiplier) {
              return new Response(JSON.stringify({
                error: `Monotonic violation: Rank #${athleteRank} (${roundedMultiplier}x) would be higher than Rank #${a.rank} (${a.final_multiplier}x)`
              }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }
          }
        }

        const existingOverride = overrideMap.get(athlete_id);
        const beforeState = existingOverride ? {
          manual_multiplier: existingOverride.manual_multiplier,
          is_enabled: existingOverride.is_enabled,
          reason: existingOverride.reason
        } : null;

        // Upsert the override (DO NOT write to selections.decimal_odds)
        const { data: upserted, error: upsertError } = await supabase
          .from('market_multiplier_overrides')
          .upsert({
            market_id,
            athlete_id,
            manual_multiplier: roundedMultiplier,
            is_enabled,
            reason: reason || null,
            created_by: createdBy,
            updated_at: new Date().toISOString()
          }, { onConflict: 'market_id,athlete_id' })
          .select()
          .single();

        if (upsertError) {
          console.error('[OVERRIDE] Upsert error:', upsertError);
          return new Response(JSON.stringify({ error: upsertError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // REMOVED: No longer update selections.decimal_odds
        // The override is stored in market_multiplier_overrides only
        // User-facing code should use override layer on top of auto odds

        // Log audit
        const athlete = (selections || []).find(s => s.athlete_id === athlete_id);
        await logAudit(
          'MULTIPLIER_OVERRIDDEN',
          upserted.id,
          beforeState,
          {
            manual_multiplier: roundedMultiplier,
            is_enabled,
            reason: reason || null
          },
          {
            market_id,
            athlete_id,
            athlete_name: (athlete?.athlete as any)?.name || 'Unknown',
            market_type: marketType,
            capped_from: manual_multiplier !== roundedMultiplier ? manual_multiplier : null
          }
        );

        // Rebuild data and metrics
        overrideMap.set(athlete_id, upserted);
        const athletes = buildAthleteData();
        const metrics = calculateMetrics(athletes);

        return new Response(JSON.stringify({
          success: true,
          override: upserted,
          athletes,
          metrics,
          applied_multiplier: roundedMultiplier,
          was_clamped: manual_multiplier !== roundedMultiplier
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'delete': {
        const { athlete_id } = body;
        
        if (!athlete_id) {
          return new Response(JSON.stringify({ error: 'athlete_id required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const existingOverride = overrideMap.get(athlete_id);
        if (!existingOverride) {
          return new Response(JSON.stringify({ error: 'Override not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Delete the override only
        await supabase
          .from('market_multiplier_overrides')
          .delete()
          .eq('id', existingOverride.id);

        // Get the auto multiplier for reference
        const autoMultiplier = autoOddsMap.get(athlete_id) || 2.0;

        // Log audit
        const selection = (selections || []).find(s => s.athlete_id === athlete_id);
        await logAudit(
          'MULTIPLIER_OVERRIDE_DELETED',
          existingOverride.id,
          {
            manual_multiplier: existingOverride.manual_multiplier,
            is_enabled: existingOverride.is_enabled,
            reason: existingOverride.reason
          },
          null,
          {
            market_id,
            athlete_id,
            athlete_name: (selection?.athlete as any)?.name || 'Unknown',
            market_type: marketType,
            reverted_to_auto: autoMultiplier
          }
        );

        // Rebuild data
        overrideMap.delete(athlete_id);
        const athletes = buildAthleteData();
        const metrics = calculateMetrics(athletes);

        return new Response(JSON.stringify({
          success: true,
          deleted: existingOverride.id,
          athletes,
          metrics
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'bulk_copy': {
        // Copy all auto multipliers to manual overrides
        const results: any[] = [];
        
        for (const selection of (selections || [])) {
          const autoMultiplier = autoOddsMap.get(selection.athlete_id) || selection.decimal_odds || 2.0;
          const roundedMultiplier = roundToStep(Math.max(caps.min, Math.min(caps.max, autoMultiplier)));
          
          const { data: upserted } = await supabase
            .from('market_multiplier_overrides')
            .upsert({
              market_id,
              athlete_id: selection.athlete_id,
              manual_multiplier: roundedMultiplier,
              is_enabled: true,
              reason: 'Bulk copied from auto',
              created_by: createdBy,
              updated_at: new Date().toISOString()
            }, { onConflict: 'market_id,athlete_id' })
            .select()
            .single();
          
          if (upserted) results.push(upserted);
        }

        // Log bulk audit
        await logAudit(
          'MULTIPLIER_BULK_COPY',
          market_id,
          null,
          { count: results.length },
          { market_id, market_type: marketType }
        );

        // Rebuild
        const { data: newOverrides } = await supabase
          .from('market_multiplier_overrides')
          .select('*')
          .eq('market_id', market_id);
        
        const newOverrideMap = new Map(newOverrides?.map(o => [o.athlete_id, o]) || []);
        
        const athletes = (selections || []).map(s => {
          const override = newOverrideMap.get(s.athlete_id);
          const autoMultiplier = autoOddsMap.get(s.athlete_id) || s.decimal_odds || 2.0;
          const finalMultiplier = (override?.is_enabled && override?.manual_multiplier)
            ? override.manual_multiplier
            : autoMultiplier;
          
          return {
            athlete_id: s.athlete_id,
            athlete_name: (s.athlete as any)?.name || 'Unknown',
            rank: rankMap.get(s.athlete_id) || 999,
            auto_multiplier: autoMultiplier,
            manual_multiplier: override?.manual_multiplier || null,
            final_multiplier: finalMultiplier,
            source: (override?.is_enabled && override?.manual_multiplier) ? 'manual' : 'auto',
            is_enabled: override?.is_enabled ?? false,
            override_id: override?.id || null,
            reason: override?.reason || null
          };
        }).sort((a, b) => a.rank - b.rank);
        
        const metrics = calculateMetrics(athletes);

        return new Response(JSON.stringify({
          success: true,
          copied: results.length,
          athletes,
          metrics
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'bulk_reset': {
        // Delete all overrides for this market
        const count = existingOverrides?.length || 0;
        
        await supabase
          .from('market_multiplier_overrides')
          .delete()
          .eq('market_id', market_id);

        // Log bulk audit
        await logAudit(
          'MULTIPLIER_BULK_RESET',
          market_id,
          { count },
          null,
          { market_id, market_type: marketType }
        );

        // Rebuild with no overrides
        const athletes = (selections || []).map(s => {
          const autoMultiplier = autoOddsMap.get(s.athlete_id) || s.decimal_odds || 2.0;
          return {
            athlete_id: s.athlete_id,
            athlete_name: (s.athlete as any)?.name || 'Unknown',
            rank: rankMap.get(s.athlete_id) || 999,
            auto_multiplier: autoMultiplier,
            manual_multiplier: null,
            final_multiplier: autoMultiplier,
            source: 'auto',
            is_enabled: false,
            override_id: null,
            reason: null
          };
        }).sort((a, b) => a.rank - b.rank);
        
        const metrics = calculateMetrics(athletes);

        return new Response(JSON.stringify({
          success: true,
          deleted: count,
          athletes,
          metrics
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'bulk_disable': {
        // Disable all overrides for this market (preserves audit trail)
        const count = existingOverrides?.length || 0;
        
        await supabase
          .from('market_multiplier_overrides')
          .update({ is_enabled: false, updated_at: new Date().toISOString() })
          .eq('market_id', market_id);

        // Log audit
        await logAudit(
          'MULTIPLIER_BULK_DISABLE',
          market_id,
          { count, is_enabled: true },
          { count, is_enabled: false },
          { market_id, market_type: marketType }
        );

        // Rebuild with disabled overrides
        const athletes = (selections || []).map(s => {
          const autoMultiplier = autoOddsMap.get(s.athlete_id) || s.decimal_odds || 2.0;
          return {
            athlete_id: s.athlete_id,
            athlete_name: (s.athlete as any)?.name || 'Unknown',
            rank: rankMap.get(s.athlete_id) || 999,
            auto_multiplier: autoMultiplier,
            manual_multiplier: null,
            final_multiplier: autoMultiplier,
            source: 'auto',
            is_enabled: false,
            override_id: null,
            reason: null
          };
        }).sort((a, b) => a.rank - b.rank);
        
        const metrics = calculateMetrics(athletes);

        return new Response(JSON.stringify({
          success: true,
          disabled: count,
          athletes,
          metrics
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'repair_auto': {
        // Repair: Set selections.decimal_odds = market_odds.final_decimal_odds
        // This fixes any corruption from previous override writes
        let repaired = 0;
        
        for (const selection of (selections || [])) {
          const autoMultiplier = autoOddsMap.get(selection.athlete_id);
          if (autoMultiplier && autoMultiplier !== selection.decimal_odds) {
            await supabase
              .from('selections')
              .update({ decimal_odds: autoMultiplier })
              .eq('id', selection.id);
            repaired++;
          }
        }

        // Log audit
        await logAudit(
          'MULTIPLIER_REPAIR_AUTO',
          market_id,
          null,
          { repaired },
          { market_id, market_type: marketType }
        );

        return new Response(JSON.stringify({
          success: true,
          repaired,
          message: `Repaired ${repaired} selections to match auto-generated odds`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'clear_and_regenerate': {
        // 1. Delete all overrides
        const overrideCount = existingOverrides?.length || 0;
        await supabase
          .from('market_multiplier_overrides')
          .delete()
          .eq('market_id', market_id);

        console.log(`[OVERRIDE] Cleared ${overrideCount} overrides for market ${market_id}`);

        // 2. Call generate-market-odds to regenerate
        const { data: genData, error: genError } = await supabase.functions.invoke('generate-market-odds', {
          body: { market_id, force: true, debug: true }
        });

        if (genError) {
          console.error('[OVERRIDE] Regeneration error:', genError);
          return new Response(JSON.stringify({ 
            error: 'Failed to regenerate: ' + genError.message,
            overrides_cleared: overrideCount
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Log audit
        await logAudit(
          'MULTIPLIER_CLEAR_AND_REGENERATE',
          market_id,
          { overrides_cleared: overrideCount },
          { 
            implied_sum: genData?.implied_sum,
            calibration_status: genData?.calibration_status
          },
          { market_id, market_type: marketType }
        );

        // 3. Refetch fresh data
        const { data: freshOdds } = await supabase
          .from('market_odds')
          .select('athlete_id, final_decimal_odds')
          .eq('market_id', market_id);
        
        const freshAutoOddsMap = new Map(freshOdds?.map(o => [o.athlete_id, o.final_decimal_odds]) || []);

        const athletes = (selections || []).map(s => {
          const autoMultiplier = freshAutoOddsMap.get(s.athlete_id) || 2.0;
          return {
            athlete_id: s.athlete_id,
            athlete_name: (s.athlete as any)?.name || 'Unknown',
            rank: rankMap.get(s.athlete_id) || 999,
            auto_multiplier: autoMultiplier,
            manual_multiplier: null,
            final_multiplier: autoMultiplier,
            source: 'auto',
            is_enabled: false,
            override_id: null,
            reason: null
          };
        }).sort((a, b) => a.rank - b.rank);
        
        const metrics = calculateMetrics(athletes);

        return new Response(JSON.stringify({
          success: true,
          overrides_cleared: overrideCount,
          regeneration: genData,
          athletes,
          metrics
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

  } catch (error: unknown) {
    console.error('[OVERRIDE] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
