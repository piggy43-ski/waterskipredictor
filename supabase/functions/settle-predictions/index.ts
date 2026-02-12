import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Audit log helper - writes immutable audit entries
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
    const { error } = await supabase
      .from('audit_logs')
      .insert({
        actor_type: entry.actor_type,
        actor_id: entry.actor_id || null,
        action_type: entry.action_type,
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        before_state: entry.before_state || null,
        after_state: entry.after_state || null,
        metadata: entry.metadata || {},
      });
    
    if (error) {
      console.error('Failed to write audit log:', error);
    }
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

interface SelectionWithContext {
  selection_id: string;
  result: 'won' | 'lost' | 'void';
  athlete_name?: string;
  actual_results?: {
    position_1st?: string;
    position_2nd?: string;
    position_3rd?: string;
    winner_score?: string;
    highest_scorer?: string;
    highest_score?: string;
  };
}

interface PredictionOverride {
  prediction_id: string;
  result: 'won' | 'lost' | 'void';
}

interface SettlementRequest {
  selections: SelectionWithContext[];
  prediction_overrides?: PredictionOverride[];
  tournament_name?: string;
}

// Build settlement explanation for a prediction with detailed "Why did I win/lose?" context
function buildSettlementExplanation(
  prediction: any,
  selectionResult: 'won' | 'lost' | 'void',
  actualResults?: SelectionWithContext['actual_results'],
  tournamentName?: string,
  voidReason?: string
): object {
  const marketType = prediction.market_type;
  const athleteName = prediction.athlete_name;
  const discipline = prediction.discipline;
  const category = prediction.category;
  const stake = prediction.staked_tokens;
  const odds = prediction.decimal_odds;
  const payout = prediction.potential_payout;
  
  // Format discipline and category for display
  const disciplineDisplay = discipline.charAt(0).toUpperCase() + discipline.slice(1);
  const categoryDisplay = category.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
  
  let explanation = '';
  let pickedAthleteRank: number | null = null;
  let pickedAthleteScore: string | null = null;
  
  if (selectionResult === 'won') {
    if (marketType === 'WINNER') {
      explanation = `Correct! ${athleteName} finished 1st in ${categoryDisplay} ${disciplineDisplay}.`;
    } else if (marketType === 'PODIUM') {
      // Determine which position the athlete finished in
      let podiumPosition = '';
      if (actualResults?.position_1st?.toLowerCase() === athleteName.toLowerCase()) {
        podiumPosition = '1st';
        pickedAthleteRank = 1;
      } else if (actualResults?.position_2nd?.toLowerCase() === athleteName.toLowerCase()) {
        podiumPosition = '2nd';
        pickedAthleteRank = 2;
      } else if (actualResults?.position_3rd?.toLowerCase() === athleteName.toLowerCase()) {
        podiumPosition = '3rd';
        pickedAthleteRank = 3;
      }
      explanation = podiumPosition 
        ? `Correct! ${athleteName} finished on the podium (${podiumPosition}) in ${disciplineDisplay}.`
        : `Correct! Your podium prediction for ${categoryDisplay} ${disciplineDisplay} was correct!`;
    } else if (marketType === 'HIGHEST_SCORE') {
      const score = actualResults?.highest_score || actualResults?.winner_score;
      pickedAthleteScore = score || null;
      explanation = score
        ? `Correct! ${athleteName} posted the highest score (${score}) in ${categoryDisplay} ${disciplineDisplay}.`
        : `Correct! ${athleteName} posted the highest score in ${categoryDisplay} ${disciplineDisplay}.`;
    } else {
      explanation = `Correct! Your prediction for ${athleteName} in ${disciplineDisplay} was correct.`;
    }
  } else if (selectionResult === 'lost') {
    if (marketType === 'WINNER') {
      const winner = actualResults?.position_1st || 'another athlete';
      // Try to determine picked athlete's rank from results
      if (actualResults?.position_2nd?.toLowerCase() === athleteName.toLowerCase()) {
        pickedAthleteRank = 2;
      } else if (actualResults?.position_3rd?.toLowerCase() === athleteName.toLowerCase()) {
        pickedAthleteRank = 3;
      }
      
      if (pickedAthleteRank) {
        explanation = `Not correct. ${athleteName} finished #${pickedAthleteRank}, not 1st. Winner was ${winner}.`;
      } else {
        explanation = `Not correct. ${athleteName} did not finish 1st. Winner was ${winner}.`;
      }
    } else if (marketType === 'PODIUM') {
      // For podium bets - show what the actual podium was
      const podiumList: string[] = [];
      if (actualResults?.position_1st) podiumList.push(`1) ${actualResults.position_1st}`);
      if (actualResults?.position_2nd) podiumList.push(`2) ${actualResults.position_2nd}`);
      if (actualResults?.position_3rd) podiumList.push(`3) ${actualResults.position_3rd}`);
      
      const podiumDisplay = podiumList.length > 0 ? ` Podium: ${podiumList.join(', ')}` : '';
      explanation = `Not correct. ${athleteName} did not finish in the Top 3.${podiumDisplay}`;
    } else if (marketType === 'HIGHEST_SCORE') {
      const scorer = actualResults?.highest_scorer || 'another athlete';
      const winningScore = actualResults?.highest_score;
      
      if (winningScore) {
        explanation = `Not correct. ${athleteName} did not have the highest score. ${scorer} scored ${winningScore}.`;
      } else {
        explanation = `Not correct. ${athleteName} did not have the highest score. Highest scorer was ${scorer}.`;
      }
    } else {
      explanation = `Not correct. Your prediction for ${athleteName} in ${disciplineDisplay} was incorrect.`;
    }
  } else {
    // VOID - include specific reason if provided
    if (voidReason) {
      explanation = `Your entry on ${athleteName} was voided: ${voidReason}. Your stake has been refunded.`;
    } else {
      explanation = `Your entry on ${athleteName} in ${disciplineDisplay} was voided. Your stake has been refunded.`;
    }
  }

  return {
    status: selectionResult.toUpperCase(),
    explanation,
    tournament_name: tournamentName || prediction.tournament_name,
    market_type: marketType,
    discipline,
    category,
    athlete_picked: athleteName,
    actual_results: {
      ...(actualResults || {}),
      picked_athlete_rank: pickedAthleteRank,
      picked_athlete_score: pickedAthleteScore,
    },
    your_pick: {
      athlete_name: athleteName,
      market_type: marketType,
    },
    payout_details: {
      stake,
      odds_decimal: odds,
      payout: selectionResult === 'won' ? payout : (selectionResult === 'void' ? stake : 0),
      profit: selectionResult === 'won' ? payout - stake : 0
    },
    void_reason: selectionResult === 'void' ? (voidReason || 'Entry voided by admin') : null,
    settled_at: new Date().toISOString()
  };
}

interface SettlementResult {
  success: boolean;
  settled_predictions: number;
  total_payout: number;
  affected_users: number;
  errors?: string[];
  debug_info?: {
    selections_processed: number;
    predictions_found: number;
    selection_ids_with_predictions: string[];
    selection_ids_without_predictions: string[];
    single_bets_settled: number;
    parlays_settled: number;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Verify admin access
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: roleData, error: roleError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !roleData) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { selections, prediction_overrides, tournament_name: requestTournamentName }: SettlementRequest = await req.json();
    
    // Build a map of selection contexts for building explanations
    const selectionContextMap = new Map<string, SelectionWithContext>();
    selections.forEach(sel => {
      selectionContextMap.set(String(sel.selection_id), sel);
    });

    // Build a map of prediction overrides (for exact-order podium bets)
    const predictionOverrideMap = new Map<string, 'won' | 'lost' | 'void'>();
    if (prediction_overrides && prediction_overrides.length > 0) {
      console.log(`📋 Processing ${prediction_overrides.length} prediction overrides (exact-order podium bets)`);
      prediction_overrides.forEach(po => {
        predictionOverrideMap.set(String(po.prediction_id), po.result);
      });
    }

    if (!selections || selections.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No selections provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🎯 Starting settlement for ${selections.length} selections`);
    
    // Extract all selection IDs - ensure they're strings
    // Also include -podium suffixed variants so podium predictions are always found
    const baseSelectionIds = selections.map(s => String(s.selection_id));
    const selectionIds = [
      ...baseSelectionIds,
      ...baseSelectionIds
        .filter(id => !id.endsWith('-podium'))
        .map(id => `${id}-podium`),
    ];
    // Deduplicate
    const uniqueSelectionIds = [...new Set(selectionIds)];
    console.log(`📋 Selection IDs to process (${uniqueSelectionIds.length} incl. podium variants):`, uniqueSelectionIds.slice(0, 5), `...`);

    const result: SettlementResult = {
      success: true,
      settled_predictions: 0,
      total_payout: 0,
      affected_users: 0,
      errors: [],
      debug_info: {
        selections_processed: selections.length,
        predictions_found: 0,
        selection_ids_with_predictions: [],
        selection_ids_without_predictions: [],
        single_bets_settled: 0,
        parlays_settled: 0,
      },
    };

    const affectedUserIds = new Set<string>();
    
    // Track which bet_slips need to be settled after predictions are processed
    const betSlipsToSettle = new Map<string, { 
      slip: any; 
      predictions: any[];
      allSettled: boolean;
    }>();

    // BATCH FETCH: Get all pending predictions for all selections in ONE query
    console.log(`🔍 Fetching all pending predictions for ${uniqueSelectionIds.length} selections (incl. podium variants)...`);
    
    const { data: allPredictions, error: batchError } = await supabaseClient
      .from('predictions')
      .select('*, bet_slip:bet_slips!bet_slip_id(*)')
      .in('selection_id', uniqueSelectionIds)
      .eq('status', 'PENDING');

    if (batchError) {
      console.error('❌ Error fetching predictions batch:', batchError);
      return new Response(
        JSON.stringify({ 
          error: `Failed to fetch predictions: ${batchError.message}`,
          debug_info: {
            selection_ids: selectionIds.slice(0, 10),
            error_details: batchError,
          }
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Found ${allPredictions?.length || 0} pending predictions total`);
    result.debug_info!.predictions_found = allPredictions?.length || 0;

    // Group predictions by selection_id for efficient lookup
    const predictionsBySelection = new Map<string, typeof allPredictions>();
    
    if (allPredictions && allPredictions.length > 0) {
      allPredictions.forEach(pred => {
        const selId = String(pred.selection_id);
        if (!predictionsBySelection.has(selId)) {
          predictionsBySelection.set(selId, []);
        }
        predictionsBySelection.get(selId)!.push(pred);
        
        // Track bet_slips for later settlement
        if (pred.bet_slip_id && pred.bet_slip) {
          if (!betSlipsToSettle.has(pred.bet_slip_id)) {
            betSlipsToSettle.set(pred.bet_slip_id, {
              slip: pred.bet_slip,
              predictions: [],
              allSettled: false,
            });
          }
          betSlipsToSettle.get(pred.bet_slip_id)!.predictions.push(pred);
        }
      });

      console.log(`📊 Grouped predictions across ${predictionsBySelection.size} unique selections`);
      console.log(`📋 Tracking ${betSlipsToSettle.size} bet_slips for settlement`);
    }

    // Process each selection
    for (const { selection_id, result: selectionResult } of selections) {
      const selIdString = String(selection_id);
      
      try {
        // Get predictions for this selection from our pre-fetched batch
        const predictions = predictionsBySelection.get(selIdString) || [];
        if (predictions.length === 0) {
          console.log(`⚠️  No pending predictions for selection ${selection_id}`);
          result.debug_info!.selection_ids_without_predictions.push(selIdString);
          continue;
        }

        console.log(`💰 Processing ${predictions.length} predictions for selection ${selection_id} (${selectionResult})`);
        result.debug_info!.selection_ids_with_predictions.push(selIdString);

        // Process each prediction
        for (const prediction of predictions) {
          // IDEMPOTENCY GUARD: Skip if already settled
          if (prediction.status !== 'PENDING' || prediction.settled_at) {
            console.log(`⏭️  Skipping prediction ${prediction.id} - already ${prediction.status} (settled_at: ${prediction.settled_at})`);
            continue;
          }
          
          affectedUserIds.add(prediction.user_id);
          
          // Get the selection context for building explanations
          const selectionContext = selectionContextMap.get(selIdString);
          const actualResults = selectionContext?.actual_results;
          
          // FIXED: Check if this is part of a parlay using bet_slip data
          // A prediction is part of a parlay if its bet_slip has leg_count > 1 OR type === 'parlay'
          const betSlip = prediction.bet_slip;
          const isPartOfParlay = betSlip && (betSlip.leg_count > 1 || betSlip.type === 'parlay');

          // Check for prediction override (exact-order podium bets have explicit results)
          const overrideResult = predictionOverrideMap.get(String(prediction.id));
          const effectiveResult = overrideResult || selectionResult;
          
          console.log(`📝 Prediction ${prediction.id}: override=${overrideResult}, selection=${selectionResult}, effective=${effectiveResult}`);

          if (effectiveResult === 'won') {
            // Build settlement explanation
            const settlementMetadata = buildSettlementExplanation(
              prediction,
              'won',
              actualResults,
              requestTournamentName
            );
            
            // For parlay predictions, payout is 0 (handled at bet_slip level)
            const payoutAmount = isPartOfParlay ? 0 : prediction.potential_payout;
            
            // Update prediction to WON and set payout
            const { error: updateError } = await supabaseClient
              .from('predictions')
              .update({
                status: 'WON',
                payout_tokens: payoutAmount,
                settled_at: new Date().toISOString(),
                settlement_metadata: settlementMetadata,
              })
              .eq('id', prediction.id);

            if (updateError) {
              result.errors?.push(`Failed to update prediction ${prediction.id}: ${updateError.message}`);
              console.error(`❌ Prediction update error:`, updateError);
              continue;
            }

            result.settled_predictions += 1;

            // Only credit wallet for SINGLE bets, not parlay legs
            if (!isPartOfParlay && payoutAmount > 0) {
              const { error: walletError } = await supabaseClient.rpc('increment_earned_tokens', {
                user_id_param: prediction.user_id,
                amount: payoutAmount,
              });

              if (walletError) {
                // If wallet update fails, rollback the prediction update
                await supabaseClient
                  .from('predictions')
                  .update({
                    status: 'PENDING',
                    payout_tokens: null,
                    settled_at: null,
                  })
                  .eq('id', prediction.id);

                result.errors?.push(`Failed to update wallet for prediction ${prediction.id}: ${walletError.message}`);
                console.error(`❌ Wallet error, rolled back:`, walletError);
                continue;
              }

              result.total_payout += payoutAmount;

              // Log transaction for single bets only
              const { data: walletData } = await supabaseClient
                .from('token_wallets')
                .select('purchased_tokens, earned_tokens')
                .eq('user_id', prediction.user_id)
                .single();
              
              if (walletData) {
                const profit = payoutAmount - prediction.staked_tokens;
                await supabaseClient.from('token_transactions').insert({
                  user_id: prediction.user_id,
                  type: 'prediction_won',
                  amount: payoutAmount,
                  balance_after: walletData.purchased_tokens + walletData.earned_tokens,
                  reference_type: 'prediction',
                  reference_id: prediction.id,
                  description: `Won prediction on ${prediction.athlete_name} (${prediction.discipline}) - Staked ${prediction.staked_tokens}, won ${payoutAmount} (+${profit} profit)`,
                  metadata: {
                    tournament_name: prediction.tournament_name,
                    athlete_name: prediction.athlete_name,
                    discipline: prediction.discipline,
                    market_type: prediction.market_type,
                    staked: prediction.staked_tokens,
                    odds: prediction.decimal_odds,
                    payout: payoutAmount,
                    profit: profit
                  }
                });
              }

              // Update lifetime winnings in profile for single bets
              const winAmount = payoutAmount - prediction.staked_tokens;
              if (winAmount > 0) {
                const { data: profileData } = await supabaseClient
                  .from('profiles')
                  .select('lifetime_winnings')
                  .eq('id', prediction.user_id)
                  .single();
                
                if (profileData) {
                  await supabaseClient
                    .from('profiles')
                    .update({
                      lifetime_winnings: (profileData.lifetime_winnings || 0) + winAmount
                    })
                    .eq('id', prediction.user_id);
                }
              }
            }
            
            console.log(`✅ WON: ${prediction.id} → +${isPartOfParlay ? 0 : payoutAmount} tokens (parlay leg: ${isPartOfParlay})`);
          } else if (effectiveResult === 'lost') {
            // Build settlement explanation for LOST
            const settlementMetadata = buildSettlementExplanation(
              prediction,
              'lost',
              actualResults,
              requestTournamentName
            );
            
            // Update prediction to LOST
            const { error: updateError } = await supabaseClient
              .from('predictions')
              .update({
                status: 'LOST',
                payout_tokens: 0,
                settled_at: new Date().toISOString(),
                settlement_metadata: settlementMetadata,
              })
              .eq('id', prediction.id);

            if (updateError) {
              result.errors?.push(`Failed to update prediction ${prediction.id}: ${updateError.message}`);
              console.error(`❌ Prediction update error:`, updateError);
              continue;
            }

            result.settled_predictions += 1;

            // Log transaction with improved description
            const { data: walletData } = await supabaseClient
              .from('token_wallets')
              .select('purchased_tokens, earned_tokens')
              .eq('user_id', prediction.user_id)
              .single();
            
            if (walletData && !isPartOfParlay) {
              // Only log transaction for single entries, not parlay legs
              await supabaseClient.from('token_transactions').insert({
                user_id: prediction.user_id,
                type: 'prediction_lost',
                amount: -prediction.staked_tokens,
                balance_after: walletData.purchased_tokens + walletData.earned_tokens,
                reference_type: 'prediction',
                reference_id: prediction.id,
                description: `Lost prediction on ${prediction.athlete_name} (${prediction.discipline}) - Lost ${prediction.staked_tokens} tokens`,
                metadata: {
                  tournament_name: prediction.tournament_name,
                  athlete_name: prediction.athlete_name,
                  discipline: prediction.discipline,
                  market_type: prediction.market_type,
                  staked: prediction.staked_tokens,
                  odds: prediction.decimal_odds,
                  lost: prediction.staked_tokens
                }
              });

              // Update lifetime losses in profile
              const { data: profileData } = await supabaseClient
                .from('profiles')
                .select('lifetime_losses')
                .eq('id', prediction.user_id)
                .single();
              
              if (profileData) {
                await supabaseClient
                  .from('profiles')
                  .update({
                    lifetime_losses: (profileData.lifetime_losses || 0) + prediction.staked_tokens
                  })
                  .eq('id', prediction.user_id);
              }
            }

            console.log(`❌ LOST: ${prediction.id} (parlay leg: ${isPartOfParlay})`);
          } else if (effectiveResult === 'void') {
            // Build settlement explanation for VOID
            const settlementMetadata = buildSettlementExplanation(
              prediction,
              'void',
              actualResults,
              requestTournamentName
            );
            
            // Refund stake for void predictions (only single bets)
            const { error: updateError } = await supabaseClient
              .from('predictions')
              .update({
                status: 'VOID',
                payout_tokens: isPartOfParlay ? 0 : prediction.staked_tokens,
                settled_at: new Date().toISOString(),
                settlement_metadata: settlementMetadata,
              })
              .eq('id', prediction.id);

            if (updateError) {
              result.errors?.push(`Failed to update prediction ${prediction.id}: ${updateError.message}`);
              console.error(`❌ Prediction update error:`, updateError);
              continue;
            }

            // Refund stake to wallet only for single bets
            if (!isPartOfParlay) {
              const { error: walletError } = await supabaseClient.rpc('increment_earned_tokens', {
                user_id_param: prediction.user_id,
                amount: prediction.staked_tokens,
              });

              if (walletError) {
                // Rollback
                await supabaseClient
                  .from('predictions')
                  .update({
                    status: 'PENDING',
                    payout_tokens: null,
                    settled_at: null,
                  })
                  .eq('id', prediction.id);

                result.errors?.push(`Failed to refund for prediction ${prediction.id}: ${walletError.message}`);
                console.error(`❌ Wallet error, rolled back:`, walletError);
                continue;
              }

              result.total_payout += prediction.staked_tokens;
              result.settled_predictions += 1;

              // Log transaction
              const { data: walletData } = await supabaseClient
                .from('token_wallets')
                .select('purchased_tokens, earned_tokens')
                .eq('user_id', prediction.user_id)
                .single();
              
              if (walletData) {
                await supabaseClient.from('token_transactions').insert({
                  user_id: prediction.user_id,
                  type: 'prediction_void',
                  amount: prediction.staked_tokens,
                  balance_after: walletData.purchased_tokens + walletData.earned_tokens,
                  reference_type: 'prediction',
                  reference_id: prediction.id,
                  description: `Voided prediction on ${prediction.athlete_name} (${prediction.discipline}) - Refunded ${prediction.staked_tokens} tokens`,
                  metadata: {
                    tournament_name: prediction.tournament_name,
                    athlete_name: prediction.athlete_name,
                    discipline: prediction.discipline,
                    refunded: prediction.staked_tokens
                  }
                });
              }
            }

            console.log(`🔄 VOID: ${prediction.id} → refunded ${isPartOfParlay ? 0 : prediction.staked_tokens} tokens (parlay leg: ${isPartOfParlay})`);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors?.push(`Error processing selection ${selection_id}: ${errorMessage}`);
        console.error(`❌ Error processing selection ${selection_id}:`, error);
      }
    }

    result.affected_users = affectedUserIds.size;

    // ENTRY SETTLEMENT: Process ALL entries (both single and parlay)
    console.log(`\n🎯 Starting entry settlement...`);
    
    try {
      // Fetch all pending bet slips that might have been affected
      const { data: pendingSlips, error: slipsFetchError } = await supabaseClient
        .from('bet_slips')
        .select('*')
        .eq('status', 'PENDING');

      if (slipsFetchError) {
        console.error('❌ Error fetching bet slips:', slipsFetchError);
      } else if (pendingSlips && pendingSlips.length > 0) {
        console.log(`📋 Found ${pendingSlips.length} pending bet slips to check`);

        for (const slip of pendingSlips) {
          try {
            // Get all legs/predictions for this bet slip
            const { data: legs, error: legsError } = await supabaseClient
              .from('predictions')
              .select('*')
              .eq('bet_slip_id', slip.id);

            if (legsError || !legs || legs.length === 0) {
              console.log(`⚠️  No legs found for slip ${slip.id}`);
              continue;
            }

            // Check if all legs are settled
            const allSettled = legs.every(leg => leg.status !== 'PENDING');
            if (!allSettled) {
              console.log(`⏳ Slip ${slip.id} has pending legs, skipping`);
              continue;
            }

            const isParlay = slip.type === 'parlay' || slip.leg_count > 1;

            if (isParlay) {
              // PARLAY LOGIC
              // Check if any leg is LOST
              const hasLostLeg = legs.some(leg => leg.status === 'LOST');
              if (hasLostLeg) {
                // Parlay loses if any leg loses
                await supabaseClient
                  .from('bet_slips')
                  .update({
                    status: 'LOST',
                    actual_payout_tokens: 0,
                    settled_at: new Date().toISOString()
                  })
                  .eq('id', slip.id);

                // Log transaction for parlay loss
                const { data: walletData } = await supabaseClient
                  .from('token_wallets')
                  .select('purchased_tokens, earned_tokens')
                  .eq('user_id', slip.user_id)
                  .single();
                
                if (walletData) {
                  const athleteNames = legs.map(l => l.athlete_name).join(', ');
                  await supabaseClient.from('token_transactions').insert({
                    user_id: slip.user_id,
                    type: 'prediction_lost',
                    amount: -slip.total_stake_tokens,
                    balance_after: walletData.purchased_tokens + walletData.earned_tokens,
                    reference_type: 'entry',
                    reference_id: slip.id,
                    description: `Lost ${slip.leg_count}-leg parlay (${athleteNames}) - Lost ${slip.total_stake_tokens} tokens`,
                    metadata: {
                      entry_type: 'parlay',
                      leg_count: slip.leg_count,
                      staked: slip.total_stake_tokens,
                      athletes: legs.map(l => l.athlete_name)
                    }
                  });
                }

                // Update lifetime losses
                const { data: profileData } = await supabaseClient
                  .from('profiles')
                  .select('lifetime_losses')
                  .eq('id', slip.user_id)
                  .single();
                
                if (profileData) {
                  await supabaseClient
                    .from('profiles')
                    .update({
                      lifetime_losses: (profileData.lifetime_losses || 0) + slip.total_stake_tokens
                    })
                    .eq('id', slip.user_id);
                }

                result.debug_info!.parlays_settled++;
                console.log(`❌ Parlay ${slip.id} LOST`);
                continue;
              }

              // All legs are WON or VOID - parlay wins
              // Recalculate odds treating VOID legs as 1.0
              const adjustedOdds = legs.reduce((acc, leg) => {
                if (leg.status === 'VOID') {
                  return acc * 1.0;
                }
                return acc * leg.decimal_odds;
              }, 1);

              // Apply 5% house edge
              const finalOdds = adjustedOdds * 0.95;
              const actualPayout = Math.floor(slip.total_stake_tokens * finalOdds);

              // Update slip to WON
              await supabaseClient
                .from('bet_slips')
                .update({
                  status: 'WON',
                  actual_payout_tokens: actualPayout,
                  settled_at: new Date().toISOString()
                })
                .eq('id', slip.id);

              // Credit user wallet
              const { error: walletError } = await supabaseClient.rpc('increment_earned_tokens', {
                user_id_param: slip.user_id,
                amount: actualPayout
              });

              if (walletError) {
                console.error(`❌ Failed to credit wallet for slip ${slip.id}:`, walletError);
                await supabaseClient
                  .from('bet_slips')
                  .update({
                    status: 'PENDING',
                    actual_payout_tokens: null,
                    settled_at: null
                  })
                  .eq('id', slip.id);
                continue;
              }

              // Log transaction for parlay win
              const { data: walletData } = await supabaseClient
                .from('token_wallets')
                .select('purchased_tokens, earned_tokens')
                .eq('user_id', slip.user_id)
                .single();
              
              if (walletData) {
                const profit = actualPayout - slip.total_stake_tokens;
                const athleteNames = legs.map(l => l.athlete_name).join(', ');
                await supabaseClient.from('token_transactions').insert({
                  user_id: slip.user_id,
                  type: 'prediction_won',
                  amount: actualPayout,
                  balance_after: walletData.purchased_tokens + walletData.earned_tokens,
                  reference_type: 'entry',
                  reference_id: slip.id,
                  description: `Won ${slip.leg_count}-leg parlay (${athleteNames}) - Staked ${slip.total_stake_tokens}, won ${actualPayout} (+${profit} profit)`,
                  metadata: {
                    entry_type: 'parlay',
                    leg_count: slip.leg_count,
                    staked: slip.total_stake_tokens,
                    odds: finalOdds,
                    payout: actualPayout,
                    profit: profit,
                    athletes: legs.map(l => l.athlete_name)
                  }
                });
              }

              // Update lifetime winnings
              const winAmount = actualPayout - slip.total_stake_tokens;
              if (winAmount > 0) {
                const { data: profileData } = await supabaseClient
                  .from('profiles')
                  .select('lifetime_winnings')
                  .eq('id', slip.user_id)
                  .single();
                
                if (profileData) {
                  await supabaseClient
                    .from('profiles')
                    .update({
                      lifetime_winnings: (profileData.lifetime_winnings || 0) + winAmount
                    })
                    .eq('id', slip.user_id);
                }
              }

              result.total_payout += actualPayout;
              affectedUserIds.add(slip.user_id);
              result.debug_info!.parlays_settled++;

              console.log(`✅ Parlay ${slip.id} WON → +${actualPayout} tokens (adjusted odds: ${finalOdds.toFixed(2)})`);
            } else {
              // SINGLE ENTRY LOGIC - Just sync entry status with the prediction
              const prediction = legs[0];
              
              let slipStatus = prediction.status;
              let actualPayout = 0;
              
              if (prediction.status === 'WON') {
                actualPayout = prediction.payout_tokens || 0;
              } else if (prediction.status === 'VOID') {
                actualPayout = prediction.staked_tokens; // Refunded
              }
              
              await supabaseClient
                .from('bet_slips')
                .update({
                  status: slipStatus,
                  actual_payout_tokens: actualPayout,
                  settled_at: new Date().toISOString()
                })
                .eq('id', slip.id);

              result.debug_info!.single_bets_settled++;
              console.log(`✅ Single entry ${slip.id} → ${slipStatus} (payout: ${actualPayout})`);
            }
          } catch (error) {
            console.error(`❌ Error processing entry ${slip.id}:`, error);
          }
        }

        result.affected_users = affectedUserIds.size;
        console.log(`🎉 Entry settlement complete`);
      } else {
        console.log(`📋 No pending bet slips to process`);
      }
    } catch (error) {
      console.error('❌ Error in entry settlement:', error);
    }

    // Mark tournament as settled and update athlete stats
    let tournamentId: string | null = null;
    
    if (result.settled_predictions > 0 && predictionsBySelection.size > 0) {
      try {
        // Get tournament_id from the first selection that had predictions
        const firstSelectionId = Array.from(predictionsBySelection.keys())[0];
        const { data: selectionData, error: selError } = await supabaseClient
          .from('selections')
          .select('market_id')
          .eq('id', firstSelectionId)
          .single();

        if (selectionData && !selError) {
          const { data: marketData, error: marketError } = await supabaseClient
            .from('markets')
            .select('tournament_id')
            .eq('id', selectionData.market_id)
            .single();

          if (marketData && !marketError) {
            tournamentId = marketData.tournament_id;
            
            const { error: tournamentError } = await supabaseClient
              .from('tournaments')
              .update({ settled_at: new Date().toISOString() })
              .eq('id', marketData.tournament_id);

            if (tournamentError) {
              console.error('⚠️  Failed to mark tournament as settled:', tournamentError);
            } else {
              console.log(`✅ Tournament ${marketData.tournament_id} marked as settled`);
            }
          }
        }
      } catch (error) {
        console.error('⚠️  Error marking tournament as settled:', error);
      }
    }

    // ============= ATHLETE STATS LEARNING =============
    if (tournamentId) {
      console.log(`\n📊 Updating athlete stats from tournament results...`);
      
      try {
        const { data: tournamentResults, error: resultsError } = await supabaseClient
          .from('tournament_results')
          .select('*')
          .eq('tournament_id', tournamentId)
          .eq('round_type', 'final');
        
        if (resultsError) {
          console.error('⚠️  Failed to fetch tournament results:', resultsError);
        } else if (tournamentResults && tournamentResults.length > 0) {
          console.log(`📋 Processing ${tournamentResults.length} athlete results`);
          
          const TIER_BONUSES: Record<string, number> = {
            tier1: 0.15,
            tier2: 0.07,
            tier3: 0.03,
            unranked: 0,
          };
          
          const FANTASY_PRICE_BANDS: Record<string, { base: number; maxMultiplier: number }> = {
            tier1: { base: 12000, maxMultiplier: 1.5 },
            tier2: { base: 8000, maxMultiplier: 1.3 },
            tier3: { base: 5000, maxMultiplier: 1.2 },
            unranked: { base: 3000, maxMultiplier: 1.1 },
          };
          
          for (const resultRow of tournamentResults) {
            const discipline = resultRow.discipline;
            const position = resultRow.final_overall_rank;
            const athleteId = resultRow.athlete_id;
            
            const { data: athlete, error: athleteError } = await supabaseClient
              .from('athletes')
              .select('*')
              .eq('id', athleteId)
              .single();
            
            if (athleteError || !athlete) {
              console.log(`⚠️  Could not find athlete ${athleteId}`);
              continue;
            }
            
            const updates: Record<string, unknown> = {};
            
            const careerEventsKey = `career_events_${discipline}`;
            const seasonEventsKey = `season_events_${discipline}`;
            updates[careerEventsKey] = (athlete[careerEventsKey] || 0) + 1;
            updates[seasonEventsKey] = (athlete[seasonEventsKey] || 0) + 1;
            
            if (position === 1) {
              const careerWinsKey = `career_wins_${discipline}`;
              const seasonWinsKey = `season_wins_${discipline}`;
              const careerPodiumsKey = `career_podiums_${discipline}`;
              const seasonPodiumsKey = `season_podiums_${discipline}`;
              
              updates[careerWinsKey] = (athlete[careerWinsKey] || 0) + 1;
              updates[seasonWinsKey] = (athlete[seasonWinsKey] || 0) + 1;
              updates[careerPodiumsKey] = (athlete[careerPodiumsKey] || 0) + 1;
              updates[seasonPodiumsKey] = (athlete[seasonPodiumsKey] || 0) + 1;
            } else if (position && position <= 3) {
              const careerPodiumsKey = `career_podiums_${discipline}`;
              const seasonPodiumsKey = `season_podiums_${discipline}`;
              
              updates[careerPodiumsKey] = (athlete[careerPodiumsKey] || 0) + 1;
              updates[seasonPodiumsKey] = (athlete[seasonPodiumsKey] || 0) + 1;
            }
            
            if (position && position <= 8) {
              const careerTop8Key = `career_top8_${discipline}`;
              updates[careerTop8Key] = (athlete[careerTop8Key] || 0) + 1;
            }
            
            const last5Key = `last_5_results_${discipline}`;
            const currentLast5 = (athlete[last5Key] as Array<{ position: number; score: number }>) || [];
            const newLast5 = [
              { position: position || 99, score: resultRow.raw_score || 0 },
              ...currentLast5
            ].slice(0, 5);
            updates[last5Key] = newLast5;
            
            const avgPlace = newLast5.reduce((sum, r) => sum + (r.position || 20), 0) / newLast5.length;
            const seasonAvgPlaceKey = `season_avg_place_${discipline}`;
            updates[seasonAvgPlaceKey] = avgPlace;
            
            const tierKey = `strength_tier_${discipline}`;
            const tier = (athlete[tierKey] as string) || 'unranked';
            const tierBonus = TIER_BONUSES[tier] || 0;
            
            const seasonEvents = updates[seasonEventsKey] as number;
            const seasonPodiums = (updates[`season_podiums_${discipline}`] as number) || 
                                  (athlete[`season_podiums_${discipline}`] || 0);
            const careerEvents = updates[careerEventsKey] as number;
            const careerPodiums = (updates[`career_podiums_${discipline}`] as number) || 
                                  (athlete[`career_podiums_${discipline}`] || 0);
            
            const seasonPodiumRate = seasonEvents > 0 ? seasonPodiums / seasonEvents : 0.15;
            const careerPodiumRate = careerEvents > 0 ? careerPodiums / careerEvents : 0.15;
            const avgPlaceScore = avgPlace > 0 ? Math.min(1, 1 / avgPlace) : 0.1;
            
            const strengthScore = Math.max(0.05, (
              0.4 * seasonPodiumRate +
              0.2 * careerPodiumRate +
              0.2 * avgPlaceScore +
              0.2 * tierBonus
            ));
            
            const strengthScoreKey = `odds_strength_score_${discipline}`;
            updates[strengthScoreKey] = strengthScore;
            
            const band = FANTASY_PRICE_BANDS[tier] || FANTASY_PRICE_BANDS.unranked;
            const multiplier = 1 + (seasonPodiumRate * (band.maxMultiplier - 1));
            let fantasyPrice = Math.round(band.base * multiplier);
            fantasyPrice = Math.max(2000, Math.min(20000, fantasyPrice));
            
            const fantasyPriceKey = `fantasy_price_${discipline}`;
            updates[fantasyPriceKey] = fantasyPrice;
            
            const { error: updateError } = await supabaseClient
              .from('athletes')
              .update(updates)
              .eq('id', athleteId);
            
            if (updateError) {
              console.error(`⚠️  Failed to update athlete ${athlete.name}: ${updateError.message}`);
            } else {
              console.log(`✅ Updated ${athlete.name} (${discipline}): strength=${strengthScore.toFixed(3)}, price=${fantasyPrice}`);
            }
          }
          
          console.log(`📊 Athlete stats update complete`);
        } else {
          console.log(`📋 No athlete results found for tournament ${tournamentId}`);
        }
      } catch (error) {
        console.error('⚠️  Error updating athlete stats:', error);
      }
    }

    // ============= EMAIL NOTIFICATIONS =============
    console.log(`\n📧 Sending bet result emails to ${affectedUserIds.size} users...`);
    let emailsSent = 0;
    let emailsFailed = 0;

    try {
      // Get all settled predictions with user data
      const { data: settledPredictions, error: settledError } = await supabaseClient
        .from('predictions')
        .select(`
          id,
          user_id,
          athlete_name,
          tournament_name,
          discipline,
          staked_tokens,
          payout_tokens,
          status
        `)
        .in('user_id', Array.from(affectedUserIds))
        .in('status', ['WON', 'LOST', 'VOID'])
        .order('settled_at', { ascending: false });

      if (settledError) {
        console.error('❌ Error fetching settled predictions for emails:', settledError);
      } else if (settledPredictions && settledPredictions.length > 0) {
        // Get user emails
        const { data: profiles, error: profilesError } = await supabaseClient
          .from('profiles')
          .select('id, email, username')
          .in('id', Array.from(affectedUserIds));

        if (profilesError) {
          console.error('❌ Error fetching user profiles for emails:', profilesError);
        } else if (profiles) {
          const profileMap = new Map(profiles.map(p => [p.id, p]));
          
          // Group predictions by user to avoid spamming
          const predictionsByUser = new Map<string, typeof settledPredictions>();
          for (const pred of settledPredictions) {
            if (!predictionsByUser.has(pred.user_id)) {
              predictionsByUser.set(pred.user_id, []);
            }
            predictionsByUser.get(pred.user_id)!.push(pred);
          }

          // Send emails to each user (limit to first 3 predictions per user to avoid spam)
          for (const [userId, userPredictions] of predictionsByUser) {
            const profile = profileMap.get(userId);
            if (!profile || !profile.email) {
              console.log(`⚠️  No email found for user ${userId}, skipping`);
              continue;
            }

            // Send email for the most significant result (prioritize wins)
            const winPred = userPredictions.find(p => p.status === 'WON');
            const predToEmail = winPred || userPredictions[0];
            
            try {
              const emailResponse = await fetch(
                `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                  },
                  body: JSON.stringify({
                    type: 'bet_result',
                    to: profile.email,
                    userId: userId,
                    data: {
                      username: profile.username || 'Champion',
                      athleteName: predToEmail.athlete_name,
                      tournamentName: predToEmail.tournament_name || requestTournamentName || 'Tournament',
                      result: predToEmail.status.toLowerCase(),
                      stakedTokens: predToEmail.staked_tokens,
                      payoutTokens: predToEmail.payout_tokens || 0,
                    }
                  }),
                }
              );

              if (emailResponse.ok) {
                emailsSent++;
                console.log(`✅ Email sent to ${profile.email} (${predToEmail.status})`);
              } else {
                emailsFailed++;
                const errorText = await emailResponse.text();
                console.error(`❌ Failed to send email to ${profile.email}:`, errorText);
              }
            } catch (emailError) {
              emailsFailed++;
              console.error(`❌ Email error for ${profile.email}:`, emailError);
            }
          }
        }
      }
    } catch (emailBatchError) {
      console.error('❌ Error in email notification batch:', emailBatchError);
    }

    console.log(`📧 Email notifications: ${emailsSent} sent, ${emailsFailed} failed`);

    // ============= IN-APP NOTIFICATIONS =============
    console.log(`\n🔔 Creating in-app notifications for ${affectedUserIds.size} users...`);
    let notificationsSent = 0;
    
    try {
      // Check user preferences for results notifications
      const { data: userPrefs } = await supabaseClient
        .from('email_preferences')
        .select('user_id, results_notifications')
        .in('user_id', Array.from(affectedUserIds));
      
      const prefsMap = new Map(userPrefs?.map(p => [p.user_id, p.results_notifications]) || []);
      
      // Create notifications for each affected user (respecting preferences)
      const notifications = Array.from(affectedUserIds)
        .filter(userId => {
          const pref = prefsMap.get(userId);
          return pref === undefined || pref === true; // Default to true if no preference
        })
        .map(userId => ({
          user_id: userId,
          type: 'RESULTS_POSTED',
          title: 'Results are in!',
          message: `Your entries for ${requestTournamentName || 'the tournament'} have been settled.`,
          link: '/predictions',
          read: false,
          metadata: {
            tournament_name: requestTournamentName,
            settlement_batch: new Date().toISOString(),
          },
        }));

      if (notifications.length > 0) {
        const { error: notifError } = await supabaseClient
          .from('notifications')
          .insert(notifications);
        
        if (notifError) {
          console.error('❌ Error creating in-app notifications:', notifError);
        } else {
          notificationsSent = notifications.length;
          console.log(`✅ Created ${notificationsSent} in-app notifications`);
        }
      }
    } catch (notifBatchError) {
      console.error('❌ Error in notification batch:', notifBatchError);
    }

    console.log(`\n🎉 Settlement complete:`);
    console.log(`   ✅ ${result.settled_predictions} predictions settled`);
    console.log(`   💰 ${result.total_payout} tokens paid out`);
    console.log(`   👥 ${result.affected_users} users affected`);
    console.log(`   🎫 ${result.debug_info!.single_bets_settled} single bets settled`);
    console.log(`   🎰 ${result.debug_info!.parlays_settled} parlays settled`);
    console.log(`   📧 ${emailsSent} emails sent`);
    if (result.errors && result.errors.length > 0) {
      console.log(`   ❌ ${result.errors.length} errors occurred`);
    }

    // Write audit log for the settlement batch - RESULTS_SETTLED
    await writeAuditLog(supabaseClient, {
      actor_type: 'admin',
      actor_id: user.id,
      action_type: 'RESULTS_SETTLED',
      entity_type: 'settlement_batch',
      entity_id: `batch_${new Date().toISOString()}`,
      before_state: {
        selections_count: selections.length,
        pending_predictions: result.debug_info?.predictions_found
      },
      after_state: {
        settled_predictions: result.settled_predictions,
        total_payout: result.total_payout,
        affected_users: result.affected_users,
        single_bets_settled: result.debug_info?.single_bets_settled,
        parlays_settled: result.debug_info?.parlays_settled,
        errors_count: result.errors?.length || 0
      },
      metadata: {
        tournament_name: requestTournamentName,
        selection_ids: selectionIds.slice(0, 20),
      }
    });

    // Write audit log for entry results generation - ENTRY_RESULTS_GENERATED
    const wonCount = result.debug_info?.single_bets_settled || 0;
    const lostCount = result.settled_predictions - wonCount;
    await writeAuditLog(supabaseClient, {
      actor_type: 'system',
      action_type: 'ENTRY_RESULTS_GENERATED',
      entity_type: 'predictions',
      entity_id: 'batch',
      metadata: {
        count: result.settled_predictions,
        won: wonCount,
        lost: lostCount,
        void: 0, // Would need to track separately
        tournament_name: requestTournamentName,
      }
    });

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('💥 Settlement error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
