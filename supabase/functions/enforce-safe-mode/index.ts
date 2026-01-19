import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Odds ladder for rounding
const ODDS_LADDER = [
  1.05, 1.10, 1.15, 1.20, 1.25, 1.30, 1.35, 1.40, 1.45, 1.50,
  1.55, 1.60, 1.65, 1.70, 1.75, 1.80, 1.85, 1.90, 1.95, 2.00,
  2.10, 2.20, 2.30, 2.40, 2.50, 2.60, 2.70, 2.80, 2.90, 3.00,
  3.20, 3.40, 3.60, 3.80, 4.00, 4.20, 4.40, 4.60, 4.80, 5.00,
  5.50, 6.00, 6.50, 7.00, 7.50, 8.00, 8.50, 9.00, 9.50, 10.0,
  11.0, 12.0, 13.0, 14.0, 15.0, 16.0, 17.0, 18.0, 19.0, 20.0,
  21.0, 22.0, 23.0, 24.0, 25.0
];

function roundToLadder(odds: number): number {
  if (odds <= ODDS_LADDER[0]) return ODDS_LADDER[0];
  if (odds >= ODDS_LADDER[ODDS_LADDER.length - 1]) return ODDS_LADDER[ODDS_LADDER.length - 1];
  
  for (let i = 0; i < ODDS_LADDER.length - 1; i++) {
    if (odds >= ODDS_LADDER[i] && odds < ODDS_LADDER[i + 1]) {
      const mid = (ODDS_LADDER[i] + ODDS_LADDER[i + 1]) / 2;
      return odds < mid ? ODDS_LADDER[i] : ODDS_LADDER[i + 1];
    }
  }
  return odds;
}

interface AuditLogEntry {
  action_type: string;
  actor_type: string;
  actor_id: string | null;
  entity_type: string;
  entity_id: string;
  before_state: any;
  after_state: any;
  metadata: any;
}

async function writeAuditLog(supabase: any, entry: AuditLogEntry): Promise<void> {
  try {
    await supabase.from('audit_logs').insert(entry);
  } catch (error) {
    console.error('[enforce-safe-mode] Failed to write audit log:', error);
  }
}

/**
 * Sample from a categorical distribution
 */
function sampleCategorical(probabilities: number[]): number {
  const rand = Math.random();
  let cumSum = 0;
  for (let i = 0; i < probabilities.length; i++) {
    cumSum += probabilities[i];
    if (rand <= cumSum) return i;
  }
  return probabilities.length - 1;
}

/**
 * Run Monte Carlo simulation of house profit
 */
function simulateHouseProfit(
  athletes: { probability: number; tokens: number; multiplier: number }[],
  totalTokens: number,
  N: number
): { lossProbability: number; expectedProfit: number; profitP05: number } {
  const profits: number[] = [];
  
  const probSum = athletes.reduce((sum, a) => sum + a.probability, 0);
  const normalizedProbs = athletes.map(a => a.probability / probSum);
  
  for (let k = 0; k < N; k++) {
    const winnerIndex = sampleCategorical(normalizedProbs);
    const winner = athletes[winnerIndex];
    const payout = winner.tokens * winner.multiplier;
    profits.push(totalTokens - payout);
  }
  
  profits.sort((a, b) => a - b);
  
  return {
    lossProbability: profits.filter(p => p < 0).length / N,
    expectedProfit: profits.reduce((sum, p) => sum + p, 0) / N,
    profitP05: profits[Math.floor(N * 0.05)] ?? 0
  };
}

interface RiskConfig {
  targetLossProbability: number;
  maxRiskRatioWinner: number;
  maxRiskRatioPodium: number;
  maxRiskRatioHighestScore: number;
  adjustmentStepMax: number;
  minMultiplier: number;
  simulations: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { market_id, dry_run = false } = await req.json();

    if (!market_id) {
      return new Response(
        JSON.stringify({ error: 'market_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[enforce-safe-mode] Starting for market ${market_id}, dry_run=${dry_run}`);

    // Fetch risk config
    const { data: configData } = await supabase
      .from('risk_config')
      .select('key, value');
    
    const configMap = Object.fromEntries((configData || []).map(c => [c.key, c.value]));
    
    const config: RiskConfig = {
      targetLossProbability: parseFloat(configMap.target_loss_probability || '0.10'),
      maxRiskRatioWinner: parseFloat(configMap.max_risk_ratio_WINNER || '1.15'),
      maxRiskRatioPodium: parseFloat(configMap.max_risk_ratio_PODIUM || '1.10'),
      maxRiskRatioHighestScore: parseFloat(configMap.max_risk_ratio_HIGHEST_SCORE || '1.12'),
      adjustmentStepMax: parseFloat(configMap.adjustment_step_max || '0.08'),
      minMultiplier: parseFloat(configMap.min_multiplier || '1.05'),
      simulations: parseInt(configMap.safe_mode_simulations || '10000')
    };

    console.log('[enforce-safe-mode] Config:', config);

    // Fetch market
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('id, market_type, tournament_id, loss_probability, safe_mode_status')
      .eq('id', market_id)
      .single();

    if (marketError || !market) {
      return new Response(
        JSON.stringify({ error: 'Market not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get max risk ratio for this market type
    const riskRatioMap: Record<string, number> = {
      'WINNER': config.maxRiskRatioWinner,
      'PODIUM': config.maxRiskRatioPodium,
      'HIGHEST_SCORE': config.maxRiskRatioHighestScore
    };
    const maxRiskRatio = riskRatioMap[market.market_type] || config.maxRiskRatioWinner;

    // Fetch odds and liability data
    const { data: oddsData } = await supabase
      .from('market_odds')
      .select('athlete_id, adjusted_probability, final_decimal_odds')
      .eq('market_id', market_id);

    const { data: liabilityData } = await supabase
      .from('market_liability')
      .select('athlete_id, total_stake_tokens')
      .eq('market_id', market_id);

    const { data: selectionsData } = await supabase
      .from('selections')
      .select('id, athlete_id, decimal_odds')
      .eq('market_id', market_id);

    if (!oddsData?.length || !selectionsData?.length) {
      return new Response(
        JSON.stringify({ 
          market_id,
          status: 'PENDING',
          message: 'No odds or selections found'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build data structures
    const liabilityMap = new Map<string, number>();
    (liabilityData || []).forEach(l => liabilityMap.set(l.athlete_id, l.total_stake_tokens || 0));

    const totalTokens = (liabilityData || []).reduce((sum, l) => sum + (l.total_stake_tokens || 0), 0);

    // If no tokens, market is safe
    if (totalTokens === 0) {
      await supabase.from('markets').update({
        loss_probability: 0,
        expected_profit: 0,
        profit_p05: 0,
        safe_mode_status: 'SAFE',
        last_safe_mode_check: new Date().toISOString()
      }).eq('id', market_id);

      return new Response(
        JSON.stringify({ 
          market_id, 
          status: 'SAFE', 
          loss_probability: 0,
          message: 'No tokens in market' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build athlete data
    interface AthleteData {
      athleteId: string;
      selectionId: string;
      probability: number;
      tokens: number;
      multiplier: number;
      originalMultiplier: number;
    }

    const athletes: AthleteData[] = [];
    const selectionMap = new Map(selectionsData.map(s => [s.athlete_id, { id: s.id, odds: s.decimal_odds }]));

    for (const odds of oddsData) {
      const selection = selectionMap.get(odds.athlete_id);
      if (!selection) continue;

      athletes.push({
        athleteId: odds.athlete_id,
        selectionId: selection.id,
        probability: odds.adjusted_probability || 0.01,
        tokens: liabilityMap.get(odds.athlete_id) || 0,
        multiplier: selection.odds,
        originalMultiplier: selection.odds
      });
    }

    // Record original state for audit
    const beforeState = {
      multipliers: Object.fromEntries(athletes.map(a => [a.athleteId, a.originalMultiplier])),
      loss_probability: market.loss_probability,
      risk_ratio: 0
    };

    // STEP 1: Check and enforce risk ratio
    let currentRiskRatio = 0;
    const calculateRiskRatio = () => {
      const payouts = athletes.map(a => a.tokens * a.multiplier);
      const maxPayout = Math.max(...payouts, 0);
      return totalTokens > 0 ? maxPayout / totalTokens : 0;
    };

    currentRiskRatio = calculateRiskRatio();
    beforeState.risk_ratio = currentRiskRatio;

    let adjustmentsMade = false;
    let iterations = 0;
    const maxIterations = 10;

    // Risk ratio compression
    if (currentRiskRatio > maxRiskRatio) {
      console.log(`[enforce-safe-mode] Risk ratio ${currentRiskRatio.toFixed(3)} > max ${maxRiskRatio}`);
      
      // Find athletes with significant exposure (>5% of total)
      const overloadedAthletes = athletes
        .filter(a => a.tokens >= totalTokens * 0.05)
        .sort((a, b) => (b.tokens * b.multiplier) - (a.tokens * a.multiplier));

      for (const athlete of overloadedAthletes) {
        if (currentRiskRatio <= maxRiskRatio) break;
        
        const compressionFactor = Math.max(
          1 - config.adjustmentStepMax,
          maxRiskRatio / currentRiskRatio
        );
        
        const newMultiplier = Math.max(
          athlete.multiplier * compressionFactor,
          config.minMultiplier
        );
        
        if (newMultiplier < athlete.multiplier) {
          athlete.multiplier = roundToLadder(newMultiplier);
          adjustmentsMade = true;
          console.log(`[enforce-safe-mode] Compressed ${athlete.athleteId}: ${athlete.originalMultiplier} -> ${athlete.multiplier}`);
        }
        
        currentRiskRatio = calculateRiskRatio();
      }
    }

    // STEP 2: Simulate and enforce loss probability
    let simResult = simulateHouseProfit(
      athletes.map(a => ({ probability: a.probability, tokens: a.tokens, multiplier: a.multiplier })),
      totalTokens,
      config.simulations
    );

    console.log(`[enforce-safe-mode] Initial simulation: loss_prob=${(simResult.lossProbability * 100).toFixed(2)}%`);

    while (simResult.lossProbability > config.targetLossProbability && iterations < maxIterations) {
      iterations++;
      console.log(`[enforce-safe-mode] Iteration ${iterations}: loss_prob=${(simResult.lossProbability * 100).toFixed(2)}%`);

      // Find athletes with highest payout exposure and compress
      const sortedByPayout = [...athletes]
        .filter(a => a.tokens >= totalTokens * 0.05) // Only athletes with significant exposure
        .sort((a, b) => (b.tokens * b.multiplier) - (a.tokens * a.multiplier));

      let compressed = false;
      for (const athlete of sortedByPayout.slice(0, 3)) { // Compress top 3 per iteration
        const newMultiplier = Math.max(
          athlete.multiplier * (1 - config.adjustmentStepMax),
          config.minMultiplier
        );

        if (newMultiplier < athlete.multiplier) {
          athlete.multiplier = roundToLadder(newMultiplier);
          compressed = true;
          adjustmentsMade = true;
        }
      }

      if (!compressed) {
        console.log('[enforce-safe-mode] No more athletes to compress');
        break;
      }

      // Re-simulate
      simResult = simulateHouseProfit(
        athletes.map(a => ({ probability: a.probability, tokens: a.tokens, multiplier: a.multiplier })),
        totalTokens,
        config.simulations
      );
    }

    // Determine final status
    const finalRiskRatio = calculateRiskRatio();
    const status = simResult.lossProbability <= config.targetLossProbability ? 'SAFE' : 'RISK';

    // STEP 3: Apply changes if not dry run
    if (!dry_run && adjustmentsMade) {
      console.log('[enforce-safe-mode] Applying multiplier changes...');
      
      for (const athlete of athletes) {
        if (athlete.multiplier !== athlete.originalMultiplier) {
          await supabase
            .from('selections')
            .update({ decimal_odds: athlete.multiplier, updated_at: new Date().toISOString() })
            .eq('id', athlete.selectionId);

          await supabase
            .from('market_odds')
            .update({ final_decimal_odds: athlete.multiplier })
            .eq('market_id', market_id)
            .eq('athlete_id', athlete.athleteId);
        }
      }
    }

    // Update market with results
    if (!dry_run) {
      await supabase.from('markets').update({
        loss_probability: simResult.lossProbability,
        expected_profit: simResult.expectedProfit,
        profit_p05: simResult.profitP05,
        safe_mode_status: status,
        last_safe_mode_check: new Date().toISOString()
      }).eq('id', market_id);
    }

    // Write audit log
    if (!dry_run && adjustmentsMade) {
      const afterState = {
        multipliers: Object.fromEntries(athletes.map(a => [a.athleteId, a.multiplier])),
        loss_probability: simResult.lossProbability,
        risk_ratio: finalRiskRatio
      };

      await writeAuditLog(supabase, {
        action_type: 'SAFE_MODE_ADJUSTMENT',
        actor_type: 'system',
        actor_id: null,
        entity_type: 'market',
        entity_id: market_id,
        before_state: beforeState,
        after_state: afterState,
        metadata: {
          iterations,
          target_loss_probability: config.targetLossProbability,
          expected_profit_before: market.loss_probability,
          expected_profit_after: simResult.expectedProfit,
          athletes_compressed: athletes.filter(a => a.multiplier !== a.originalMultiplier).length
        }
      });
    }

    // Calculate final implied sum
    const finalImpliedSum = athletes.reduce((sum, a) => sum + (1 / a.multiplier), 0);

    console.log(`[enforce-safe-mode] Complete:
      - Status: ${status}
      - Loss probability: ${(simResult.lossProbability * 100).toFixed(2)}%
      - Expected profit: ${simResult.expectedProfit.toFixed(0)}
      - Risk ratio: ${finalRiskRatio.toFixed(3)}
      - Implied sum: ${finalImpliedSum.toFixed(4)}
      - Iterations: ${iterations}
      - Adjustments made: ${adjustmentsMade}`);

    return new Response(
      JSON.stringify({
        market_id,
        status,
        loss_probability: simResult.lossProbability,
        expected_profit: simResult.expectedProfit,
        profit_p05: simResult.profitP05,
        risk_ratio: finalRiskRatio,
        implied_sum: finalImpliedSum,
        iterations,
        adjustments_made: adjustmentsMade,
        athletes_compressed: athletes.filter(a => a.multiplier !== a.originalMultiplier).length,
        dry_run
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[enforce-safe-mode] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
