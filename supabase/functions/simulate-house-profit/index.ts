import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AthleteExposure {
  athleteId: string;
  athleteName: string;
  probability: number;
  tokensOnAthlete: number;
  multiplier: number;
  payoutIfWins: number;
  exposurePercent: number;
}

interface SimulationResult {
  marketId: string;
  lossProbability: number;
  expectedProfit: number;
  profitP05: number;
  profitP95: number;
  totalTokens: number;
  maxPayout: number;
  riskRatio: number;
  athleteExposures: AthleteExposure[];
  simulationsRun: number;
  status: 'SAFE' | 'RISK' | 'BLOCKED' | 'PENDING';
}

/**
 * Sample from a categorical distribution
 * Returns the index of the selected category
 */
function sampleCategorical(probabilities: number[]): number {
  const rand = Math.random();
  let cumSum = 0;
  for (let i = 0; i < probabilities.length; i++) {
    cumSum += probabilities[i];
    if (rand <= cumSum) {
      return i;
    }
  }
  return probabilities.length - 1;
}

/**
 * Run Monte Carlo simulation of house profit
 */
function runHouseProfitSimulation(
  athletes: { probability: number; tokens: number; multiplier: number }[],
  totalTokens: number,
  N: number
): { profits: number[]; lossProbability: number; expectedProfit: number; profitP05: number; profitP95: number } {
  const profits: number[] = [];
  
  // Normalize probabilities just in case they don't sum to 1
  const probSum = athletes.reduce((sum, a) => sum + a.probability, 0);
  const normalizedProbs = athletes.map(a => a.probability / probSum);
  
  for (let k = 0; k < N; k++) {
    // Sample winner based on model probabilities
    const winnerIndex = sampleCategorical(normalizedProbs);
    const winner = athletes[winnerIndex];
    
    // Calculate house profit: total stakes - payout to winner
    const payout = winner.tokens * winner.multiplier;
    const profit = totalTokens - payout;
    profits.push(profit);
  }
  
  // Sort for percentile calculation
  profits.sort((a, b) => a - b);
  
  const lossProbability = profits.filter(p => p < 0).length / N;
  const expectedProfit = profits.reduce((sum, p) => sum + p, 0) / N;
  
  // 5th and 95th percentiles
  const p05Index = Math.floor(N * 0.05);
  const p95Index = Math.floor(N * 0.95);
  const profitP05 = profits[p05Index] ?? 0;
  const profitP95 = profits[p95Index] ?? 0;
  
  return { profits, lossProbability, expectedProfit, profitP05, profitP95 };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { market_id, simulations = 10000 } = await req.json();

    if (!market_id) {
      return new Response(
        JSON.stringify({ error: 'market_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[simulate-house-profit] Starting simulation for market ${market_id} with ${simulations} runs`);

    // Get risk config for target loss probability
    const { data: configData } = await supabase
      .from('risk_config')
      .select('key, value')
      .in('key', ['target_loss_probability', 'safe_mode_simulations']);
    
    const config = Object.fromEntries((configData || []).map(c => [c.key, parseFloat(c.value as string)]));
    const targetLossProb = config.target_loss_probability ?? 0.10;
    const N = simulations || config.safe_mode_simulations || 10000;

    // Fetch market info
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('id, market_type, tournament_id, discipline, category')
      .eq('id', market_id)
      .single();

    if (marketError || !market) {
      return new Response(
        JSON.stringify({ error: 'Market not found', details: marketError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch market_odds for probabilities
    const { data: oddsData, error: oddsError } = await supabase
      .from('market_odds')
      .select(`
        athlete_id,
        adjusted_probability,
        final_decimal_odds,
        athletes!inner(name)
      `)
      .eq('market_id', market_id);

    if (oddsError) {
      console.error('[simulate-house-profit] Error fetching odds:', oddsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch odds', details: oddsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!oddsData || oddsData.length === 0) {
      console.log('[simulate-house-profit] No odds found for market');
      return new Response(
        JSON.stringify({
          marketId: market_id,
          lossProbability: 0,
          expectedProfit: 0,
          profitP05: 0,
          profitP95: 0,
          totalTokens: 0,
          maxPayout: 0,
          riskRatio: 0,
          athleteExposures: [],
          simulationsRun: 0,
          status: 'PENDING'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch market liability (token distribution per athlete)
    const { data: liabilityData, error: liabilityError } = await supabase
      .from('market_liability')
      .select('athlete_id, total_stake_tokens, total_potential_payout')
      .eq('market_id', market_id);

    if (liabilityError) {
      console.error('[simulate-house-profit] Error fetching liability:', liabilityError);
    }

    // Build athlete map
    const liabilityMap = new Map<string, { tokens: number; payout: number }>();
    (liabilityData || []).forEach(l => {
      liabilityMap.set(l.athlete_id, {
        tokens: l.total_stake_tokens || 0,
        payout: l.total_potential_payout || 0
      });
    });

    // Calculate total tokens in the market
    const totalTokens = (liabilityData || []).reduce((sum, l) => sum + (l.total_stake_tokens || 0), 0);

    // If no tokens in market yet, return safe status
    if (totalTokens === 0) {
      console.log('[simulate-house-profit] No tokens in market yet');
      
      // Still update the market with safe status
      await supabase
        .from('markets')
        .update({
          loss_probability: 0,
          expected_profit: 0,
          profit_p05: 0,
          safe_mode_status: 'SAFE',
          last_safe_mode_check: new Date().toISOString()
        })
        .eq('id', market_id);

      return new Response(
        JSON.stringify({
          marketId: market_id,
          lossProbability: 0,
          expectedProfit: 0,
          profitP05: 0,
          profitP95: 0,
          totalTokens: 0,
          maxPayout: 0,
          riskRatio: 0,
          athleteExposures: [],
          simulationsRun: N,
          status: 'SAFE'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build athlete data for simulation
    const athleteExposures: AthleteExposure[] = [];
    const simulationAthletes: { probability: number; tokens: number; multiplier: number }[] = [];

    for (const odds of oddsData) {
      const liability = liabilityMap.get(odds.athlete_id) || { tokens: 0, payout: 0 };
      const probability = odds.adjusted_probability || 0;
      const multiplier = odds.final_decimal_odds || 1;
      const tokens = liability.tokens;
      const payoutIfWins = tokens * multiplier;

      athleteExposures.push({
        athleteId: odds.athlete_id,
        athleteName: (odds.athletes as any)?.name || 'Unknown',
        probability,
        tokensOnAthlete: tokens,
        multiplier,
        payoutIfWins,
        exposurePercent: totalTokens > 0 ? (tokens / totalTokens) * 100 : 0
      });

      simulationAthletes.push({
        probability,
        tokens,
        multiplier
      });
    }

    // Run Monte Carlo simulation
    console.log(`[simulate-house-profit] Running ${N} simulations with ${simulationAthletes.length} athletes`);
    const simResult = runHouseProfitSimulation(simulationAthletes, totalTokens, N);

    // Calculate risk ratio
    const maxPayout = Math.max(...athleteExposures.map(a => a.payoutIfWins));
    const riskRatio = totalTokens > 0 ? maxPayout / totalTokens : 0;

    // Determine status
    let status: 'SAFE' | 'RISK' | 'BLOCKED' | 'PENDING' = 'SAFE';
    if (simResult.lossProbability > targetLossProb) {
      status = 'RISK';
    }

    console.log(`[simulate-house-profit] Results:
      - Loss probability: ${(simResult.lossProbability * 100).toFixed(2)}%
      - Expected profit: ${simResult.expectedProfit.toFixed(0)} tokens
      - Profit P05: ${simResult.profitP05.toFixed(0)} tokens
      - Risk ratio: ${riskRatio.toFixed(3)}
      - Status: ${status}`);

    // Update market with simulation results
    const { error: updateError } = await supabase
      .from('markets')
      .update({
        loss_probability: simResult.lossProbability,
        expected_profit: simResult.expectedProfit,
        profit_p05: simResult.profitP05,
        safe_mode_status: status,
        last_safe_mode_check: new Date().toISOString()
      })
      .eq('id', market_id);

    if (updateError) {
      console.error('[simulate-house-profit] Failed to update market:', updateError);
    }

    const result: SimulationResult = {
      marketId: market_id,
      lossProbability: simResult.lossProbability,
      expectedProfit: simResult.expectedProfit,
      profitP05: simResult.profitP05,
      profitP95: simResult.profitP95,
      totalTokens,
      maxPayout,
      riskRatio,
      athleteExposures: athleteExposures.sort((a, b) => b.payoutIfWins - a.payoutIfWins),
      simulationsRun: N,
      status
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[simulate-house-profit] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
