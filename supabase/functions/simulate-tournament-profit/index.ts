import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MarketOdds {
  id: string;
  athlete_id: string;
  normalized_probability: number;
  base_probability: number;
  final_decimal_odds: number;
  athlete_rank?: number;
}

interface MarketResult {
  market_id: string;
  market_name: string;
  market_type: string;
  discipline: string;
  category: string;
  expected_profit: number;
  loss_probability: number;
  profit_p05: number;
  profit_p95: number;
  implied_sum: number;
  implied_sum_status: 'OK' | 'WARNING' | 'BLOCKED';
  athletes_count: number;
  hypothetical_pool: number;
}

interface SimulationResult {
  tournament_id: string;
  tournament_name: string;
  total_markets: number;
  markets_analyzed: number;
  expected_profit: number;
  loss_probability: number;
  profit_p05: number;
  profit_p95: number;
  total_hypothetical_pool: number;
  market_results: MarketResult[];
  validation: {
    all_markets_have_odds: boolean;
    all_implied_sums_in_range: boolean;
    all_multipliers_capped: boolean;
    no_rank_inversions: boolean;
    ready_to_publish: boolean;
  };
  status: 'SAFE' | 'RISK' | 'BLOCKED';
}

// Sample from categorical distribution
function sampleCategorical(probabilities: number[]): number {
  const sum = probabilities.reduce((a, b) => a + b, 0);
  const normalized = probabilities.map(p => p / sum);
  const r = Math.random();
  let cumulative = 0;
  for (let i = 0; i < normalized.length; i++) {
    cumulative += normalized[i];
    if (r <= cumulative) return i;
  }
  return normalized.length - 1;
}

// Get percentile from sorted array
function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

// Distribute pool based on betting strategy
function distributePool(
  probabilities: number[],
  pool: number,
  strategy: 'proportional' | 'uniform' | 'favorite_heavy'
): number[] {
  const n = probabilities.length;
  if (n === 0) return [];

  switch (strategy) {
    case 'proportional': {
      const sum = probabilities.reduce((a, b) => a + b, 0);
      return probabilities.map(p => (p / sum) * pool);
    }
    case 'uniform': {
      const share = pool / n;
      return probabilities.map(() => share);
    }
    case 'favorite_heavy': {
      // 70% on top 3, 30% on rest
      const sortedIndices = probabilities
        .map((p, i) => ({ p, i }))
        .sort((a, b) => b.p - a.p)
        .map(x => x.i);
      
      const top3 = new Set(sortedIndices.slice(0, 3));
      const top3Pool = pool * 0.7;
      const restPool = pool * 0.3;
      const restCount = n - Math.min(3, n);
      
      const top3Probs = sortedIndices.slice(0, 3).map(i => probabilities[i]);
      const top3Sum = top3Probs.reduce((a, b) => a + b, 0);
      
      return probabilities.map((p, i) => {
        if (top3.has(i)) {
          return (p / top3Sum) * top3Pool;
        }
        return restCount > 0 ? restPool / restCount : 0;
      });
    }
    default:
      return probabilities.map(() => pool / n);
  }
}

// Run Monte Carlo simulation for a single market
function simulateMarket(
  odds: MarketOdds[],
  pool: number,
  numSimulations: number,
  strategy: 'proportional' | 'uniform' | 'favorite_heavy'
): { expected_profit: number; loss_probability: number; profit_p05: number; profit_p95: number } {
  if (odds.length === 0) {
    return { expected_profit: 0, loss_probability: 0, profit_p05: 0, profit_p95: 0 };
  }

  // Use normalized_probability, fall back to base_probability
  const probabilities = odds.map(o => o.normalized_probability || o.base_probability || 0.1);
  const multipliers = odds.map(o => o.final_decimal_odds || 2);
  const stakes = distributePool(probabilities, pool, strategy);

  const profits: number[] = [];
  let lossCount = 0;

  for (let sim = 0; sim < numSimulations; sim++) {
    // Sample winner
    const winnerIdx = sampleCategorical(probabilities);
    
    // Calculate payout
    const payout = stakes[winnerIdx] * multipliers[winnerIdx];
    
    // House profit = total pool - payout to winner
    const profit = pool - payout;
    profits.push(profit);
    
    if (profit < 0) lossCount++;
  }

  const expectedProfit = profits.reduce((a, b) => a + b, 0) / numSimulations;
  const lossProbability = lossCount / numSimulations;

  return {
    expected_profit: Math.round(expectedProfit * 100) / 100,
    loss_probability: Math.round(lossProbability * 10000) / 10000,
    profit_p05: Math.round(percentile(profits, 0.05) * 100) / 100,
    profit_p95: Math.round(percentile(profits, 0.95) * 100) / 100,
  };
}

// Get implied sum status
function getImpliedSumStatus(impliedSum: number, marketType: string): 'OK' | 'WARNING' | 'BLOCKED' {
  const bands: Record<string, { min: number; max: number }> = {
    WINNER: { min: 0.90, max: 0.915 },
    PODIUM: { min: 0.88, max: 0.92 },
    HIGHEST_SCORE: { min: 0.90, max: 0.915 },
  };
  const band = bands[marketType] || bands.WINNER;
  
  if (impliedSum >= band.min && impliedSum <= band.max) return 'OK';
  if (impliedSum >= band.min - 0.02 && impliedSum <= band.max + 0.02) return 'WARNING';
  return 'BLOCKED';
}

// Check for rank inversions (higher rank should have lower multiplier)
function hasRankInversions(odds: MarketOdds[]): boolean {
  const sorted = [...odds].sort((a, b) => (a.athlete_rank || 999) - (b.athlete_rank || 999));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].final_decimal_odds < sorted[i - 1].final_decimal_odds) {
      return true;
    }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      tournament_id,
      simulations = 10000,
      hypothetical_pool = 10000,
      betting_strategy = 'proportional'
    } = await req.json();

    if (!tournament_id) {
      return new Response(
        JSON.stringify({ error: 'tournament_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting tournament simulation for ${tournament_id}`);
    console.log(`Params: simulations=${simulations}, pool=${hypothetical_pool}, strategy=${betting_strategy}`);

    // Fetch tournament
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('id, name')
      .eq('id', tournament_id)
      .single();

    if (tournamentError || !tournament) {
      return new Response(
        JSON.stringify({ error: 'Tournament not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all markets for tournament
    const { data: markets, error: marketsError } = await supabase
      .from('markets')
      .select('id, name, market_type, discipline, category')
      .eq('tournament_id', tournament_id);

    if (marketsError) {
      throw new Error(`Failed to fetch markets: ${marketsError.message}`);
    }

    console.log(`Found ${markets?.length || 0} markets`);

    const marketResults: MarketResult[] = [];
    let allProfit: number[] = [];
    let totalLossCount = 0;
    let marketsWithOdds = 0;
    let allImpliedSumsOK = true;
    let allMultipliersCapped = true;
    let noRankInversions = true;

    // Process each market
    for (const market of markets || []) {
      // Fetch market odds (using correct column names from schema)
      const { data: odds, error: oddsError } = await supabase
        .from('market_odds')
        .select('id, athlete_id, normalized_probability, base_probability, final_decimal_odds, athlete_rank')
        .eq('market_id', market.id);

      if (oddsError || !odds || odds.length === 0) {
        console.log(`No odds for market ${market.id}`);
        marketResults.push({
          market_id: market.id,
          market_name: market.name,
          market_type: market.market_type,
          discipline: market.discipline,
          category: market.category,
          expected_profit: 0,
          loss_probability: 1,
          profit_p05: 0,
          profit_p95: 0,
          implied_sum: 0,
          implied_sum_status: 'BLOCKED',
          athletes_count: 0,
          hypothetical_pool: hypothetical_pool,
        });
        continue;
      }

      marketsWithOdds++;

      // Calculate implied sum using final_decimal_odds (multiplier)
      const impliedSum = odds.reduce((sum, o) => sum + (1 / (o.final_decimal_odds || 2)), 0);
      const impliedSumStatus = getImpliedSumStatus(impliedSum, market.market_type);
      
      if (impliedSumStatus !== 'OK') {
        allImpliedSumsOK = false;
      }

      // Check multiplier caps
      const multiplierCaps: Record<string, { min: number; max: number }> = {
        WINNER: { min: 1.05, max: 50 },
        PODIUM: { min: 1.02, max: 20 },
        HIGHEST_SCORE: { min: 1.05, max: 50 },
      };
      const caps = multiplierCaps[market.market_type] || multiplierCaps.WINNER;
      for (const o of odds) {
        const mult = o.final_decimal_odds || 2;
        if (mult < caps.min || mult > caps.max) {
          allMultipliersCapped = false;
        }
      }

      // Check rank inversions
      if (hasRankInversions(odds)) {
        noRankInversions = false;
      }

      // Run simulation
      const simResult = simulateMarket(odds, hypothetical_pool, simulations, betting_strategy);

      marketResults.push({
        market_id: market.id,
        market_name: market.name,
        market_type: market.market_type,
        discipline: market.discipline,
        category: market.category,
        expected_profit: simResult.expected_profit,
        loss_probability: simResult.loss_probability,
        profit_p05: simResult.profit_p05,
        profit_p95: simResult.profit_p95,
        implied_sum: Math.round(impliedSum * 10000) / 10000,
        implied_sum_status: impliedSumStatus,
        athletes_count: odds.length,
        hypothetical_pool: hypothetical_pool,
      });

      // Aggregate for tournament-level stats
      if (simResult.loss_probability > 0) {
        totalLossCount++;
      }
    }

    // Calculate tournament-level aggregates
    const totalExpectedProfit = marketResults.reduce((sum, m) => sum + m.expected_profit, 0);
    const avgLossProbability = marketResults.length > 0 
      ? marketResults.reduce((sum, m) => sum + m.loss_probability, 0) / marketResults.length 
      : 0;
    const totalP05 = marketResults.reduce((sum, m) => sum + m.profit_p05, 0);
    const totalP95 = marketResults.reduce((sum, m) => sum + m.profit_p95, 0);
    const totalPool = marketResults.length * hypothetical_pool;

    // Determine overall status
    let status: 'SAFE' | 'RISK' | 'BLOCKED' = 'SAFE';
    const allMarketsHaveOdds = marketsWithOdds === (markets?.length || 0);
    const readyToPublish = allMarketsHaveOdds && allImpliedSumsOK && allMultipliersCapped && noRankInversions && avgLossProbability < 0.1;

    if (!allMarketsHaveOdds || !allImpliedSumsOK) {
      status = 'BLOCKED';
    } else if (!allMultipliersCapped || !noRankInversions || avgLossProbability >= 0.1) {
      status = 'RISK';
    }

    const result: SimulationResult = {
      tournament_id: tournament.id,
      tournament_name: tournament.name,
      total_markets: markets?.length || 0,
      markets_analyzed: marketsWithOdds,
      expected_profit: Math.round(totalExpectedProfit * 100) / 100,
      loss_probability: Math.round(avgLossProbability * 10000) / 10000,
      profit_p05: Math.round(totalP05 * 100) / 100,
      profit_p95: Math.round(totalP95 * 100) / 100,
      total_hypothetical_pool: totalPool,
      market_results: marketResults,
      validation: {
        all_markets_have_odds: allMarketsHaveOdds,
        all_implied_sums_in_range: allImpliedSumsOK,
        all_multipliers_capped: allMultipliersCapped,
        no_rank_inversions: noRankInversions,
        ready_to_publish: readyToPublish,
      },
      status,
    };

    console.log(`Simulation complete: status=${status}, expected_profit=${result.expected_profit}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Simulation error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
