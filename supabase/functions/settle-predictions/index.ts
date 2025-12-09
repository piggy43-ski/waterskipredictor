import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

interface SettlementRequest {
  selections: SelectionWithContext[];
  tournament_name?: string;
}

// Build settlement explanation for a prediction
function buildSettlementExplanation(
  prediction: any,
  selectionResult: 'won' | 'lost' | 'void',
  actualResults?: SelectionWithContext['actual_results'],
  tournamentName?: string
): object {
  const marketType = prediction.market_type;
  const athleteName = prediction.athlete_name;
  const discipline = prediction.discipline;
  const category = prediction.category;
  const stake = prediction.staked_tokens;
  const odds = prediction.decimal_odds;
  const payout = prediction.potential_payout;
  
  let explanation = '';
  
  if (selectionResult === 'won') {
    if (marketType === 'WINNER') {
      explanation = `You picked ${athleteName} to win ${category.replace('_', ' ')} ${discipline}. ${athleteName} won! Your bet WON.`;
    } else if (marketType === 'PODIUM') {
      explanation = `Your podium prediction for ${category.replace('_', ' ')} ${discipline} was correct! Your bet WON.`;
    } else if (marketType === 'HIGHEST_SCORE') {
      explanation = `You picked ${athleteName} to have the highest score in ${category.replace('_', ' ')} ${discipline}. They did! Your bet WON.`;
    } else {
      explanation = `Your prediction for ${athleteName} in ${discipline} was correct. Your bet WON.`;
    }
  } else if (selectionResult === 'lost') {
    if (marketType === 'WINNER') {
      const winner = actualResults?.position_1st || 'another athlete';
      explanation = `You picked ${athleteName} to win ${category.replace('_', ' ')} ${discipline}. ${winner} won instead. Your bet LOST.`;
    } else if (marketType === 'PODIUM') {
      explanation = `Your podium prediction for ${category.replace('_', ' ')} ${discipline} was incorrect. Your bet LOST.`;
    } else if (marketType === 'HIGHEST_SCORE') {
      const scorer = actualResults?.highest_scorer || 'another athlete';
      explanation = `You picked ${athleteName} for highest score. ${scorer} had the highest score instead. Your bet LOST.`;
    } else {
      explanation = `Your prediction for ${athleteName} in ${discipline} was incorrect. Your bet LOST.`;
    }
  } else {
    explanation = `Your bet on ${athleteName} in ${discipline} was voided. Your stake has been refunded.`;
  }

  return {
    status: selectionResult.toUpperCase(),
    explanation,
    tournament_name: tournamentName || prediction.tournament_name,
    market_type: marketType,
    discipline,
    category,
    athlete_picked: athleteName,
    actual_results: actualResults || null,
    payout_details: {
      stake,
      odds_decimal: odds,
      payout: selectionResult === 'won' ? payout : (selectionResult === 'void' ? stake : 0),
      profit: selectionResult === 'won' ? payout - stake : 0
    },
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

    const { selections, tournament_name: requestTournamentName }: SettlementRequest = await req.json();
    
    // Build a map of selection contexts for building explanations
    const selectionContextMap = new Map<string, SelectionWithContext>();
    selections.forEach(sel => {
      selectionContextMap.set(String(sel.selection_id), sel);
    });

    if (!selections || selections.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No selections provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🎯 Starting settlement for ${selections.length} selections`);
    
    // Extract all selection IDs - ensure they're strings
    const selectionIds = selections.map(s => String(s.selection_id));
    console.log(`📋 Selection IDs to process:`, selectionIds.slice(0, 5), `... (showing first 5)`);

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
      },
    };

    const affectedUserIds = new Set<string>();

    // BATCH FETCH: Get all pending predictions for all selections in ONE query
    console.log(`🔍 Fetching all pending predictions for ${selectionIds.length} selections...`);
    
    const { data: allPredictions, error: batchError } = await supabaseClient
      .from('predictions')
      .select('*')
      .in('selection_id', selectionIds)
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
        const selId = String(pred.selection_id); // Ensure string comparison
        if (!predictionsBySelection.has(selId)) {
          predictionsBySelection.set(selId, []);
        }
        predictionsBySelection.get(selId)!.push(pred);
      });

      console.log(`📊 Grouped predictions across ${predictionsBySelection.size} unique selections`);
      console.log(`🔑 Selection IDs with predictions:`, Array.from(predictionsBySelection.keys()).slice(0, 5));
    }

    // Process each selection
    for (const { selection_id, result: selectionResult } of selections) {
      const selIdString = String(selection_id);
      
      try {
        // Note: we intentionally do NOT update selections.result here.
        // That column has a DB CHECK constraint with a specific enum set,
        // and settlement status is fully driven off predictions.status instead.

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
          affectedUserIds.add(prediction.user_id);
          
          // Get the selection context for building explanations
          const selectionContext = selectionContextMap.get(selIdString);
          const actualResults = selectionContext?.actual_results;
          
          // Check if this prediction is part of a parlay (bet_slip with type='parlay')
          // For parlays, we only mark the status - payouts happen at bet_slip level
          const isPartOfParlay = prediction.bet_slip_id && prediction.parlay_leg_count && prediction.parlay_leg_count > 0;

          if (selectionResult === 'won') {
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

            // Only credit wallet for SINGLE bets, not parlay legs
            // Parlay payouts are handled in the bet_slip settlement section below
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
                await supabaseClient.from('token_transactions').insert({
                  user_id: prediction.user_id,
                  type: 'bet_won',
                  amount: payoutAmount,
                  balance_after: walletData.purchased_tokens + walletData.earned_tokens,
                  reference_type: 'prediction',
                  reference_id: prediction.id,
                  description: `Won bet: ${prediction.athlete_name} - ${prediction.tournament_name}`,
                  metadata: {
                    tournament_name: prediction.tournament_name,
                    athlete_name: prediction.athlete_name,
                    staked: prediction.staked_tokens,
                    payout: payoutAmount,
                    profit: payoutAmount - prediction.staked_tokens
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
          } else if (selectionResult === 'lost') {
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

            // Log transaction
            const { data: walletData } = await supabaseClient
              .from('token_wallets')
              .select('purchased_tokens, earned_tokens')
              .eq('user_id', prediction.user_id)
              .single();
            
            if (walletData) {
              await supabaseClient.from('token_transactions').insert({
                user_id: prediction.user_id,
                type: 'bet_lost',
                amount: 0,
                balance_after: walletData.purchased_tokens + walletData.earned_tokens,
                reference_type: 'prediction',
                reference_id: prediction.id,
                description: `Lost bet: ${prediction.athlete_name} - ${prediction.tournament_name}`,
                metadata: {
                  tournament_name: prediction.tournament_name,
                  athlete_name: prediction.athlete_name,
                  staked: prediction.staked_tokens
                }
              });
            }

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

            console.log(`❌ LOST: ${prediction.id}`);
          } else if (selectionResult === 'void') {
            // Build settlement explanation for VOID
            const settlementMetadata = buildSettlementExplanation(
              prediction,
              'void',
              actualResults,
              requestTournamentName
            );
            
            // Refund stake for void predictions
            const { error: updateError } = await supabaseClient
              .from('predictions')
              .update({
                status: 'VOID',
                payout_tokens: prediction.staked_tokens,
                settled_at: new Date().toISOString(),
                settlement_metadata: settlementMetadata,
              })
              .eq('id', prediction.id);

            if (updateError) {
              result.errors?.push(`Failed to update prediction ${prediction.id}: ${updateError.message}`);
              console.error(`❌ Prediction update error:`, updateError);
              continue;
            }

            // Refund stake to wallet
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
                type: 'bet_void',
                amount: prediction.staked_tokens,
                balance_after: walletData.purchased_tokens + walletData.earned_tokens,
                reference_type: 'prediction',
                reference_id: prediction.id,
                description: `Voided bet (refunded): ${prediction.athlete_name} - ${prediction.tournament_name}`,
                metadata: {
                  tournament_name: prediction.tournament_name,
                  athlete_name: prediction.athlete_name,
                  refunded: prediction.staked_tokens
                }
              });
            }

            console.log(`🔄 VOID: ${prediction.id} → refunded ${prediction.staked_tokens} tokens to user ${prediction.user_id}`);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors?.push(`Error processing selection ${selection_id}: ${errorMessage}`);
        console.error(`❌ Error processing selection ${selection_id}:`, error);
      }
    }

    result.affected_users = affectedUserIds.size;

    // PARLAY SETTLEMENT: Process bet_slips after individual predictions are settled
    console.log(`\n🎯 Starting parlay settlement...`);
    
    try {
      // Fetch all pending parlay bet slips
      const { data: parlaySlips, error: parlayFetchError } = await supabaseClient
        .from('bet_slips')
        .select('*')
        .eq('type', 'parlay')
        .eq('status', 'PENDING');

      if (parlayFetchError) {
        console.error('❌ Error fetching parlay slips:', parlayFetchError);
      } else if (parlaySlips && parlaySlips.length > 0) {
        console.log(`📋 Found ${parlaySlips.length} pending parlay slips to check`);

        for (const slip of parlaySlips) {
          try {
            // Get all legs for this parlay
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

              console.log(`❌ Parlay ${slip.id} LOST (has losing leg)`);
              continue;
            }

            // All legs are WON or VOID
            // Recalculate odds treating VOID legs as 1.0
            const adjustedOdds = legs.reduce((acc, leg) => {
              if (leg.status === 'VOID') {
                return acc * 1.0; // Void legs don't affect odds
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
              // Rollback
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

            console.log(`✅ Parlay ${slip.id} WON → +${actualPayout} tokens (adjusted odds: ${finalOdds.toFixed(2)})`);
          } catch (error) {
            console.error(`❌ Error processing parlay slip ${slip.id}:`, error);
          }
        }

        result.affected_users = affectedUserIds.size;
        console.log(`🎉 Parlay settlement complete`);
      } else {
        console.log(`📋 No pending parlay slips to process`);
      }
    } catch (error) {
      console.error('❌ Error in parlay settlement:', error);
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
    // Update athlete career/season stats and recalculate strength scores and fantasy prices
    if (tournamentId) {
      console.log(`\n📊 Updating athlete stats from tournament results...`);
      
      try {
        // Fetch all finals results for this tournament from tournament_results
        const { data: tournamentResults, error: resultsError } = await supabaseClient
          .from('tournament_results')
          .select('*')
          .eq('tournament_id', tournamentId)
          .eq('round_type', 'final');
        
        if (resultsError) {
          console.error('⚠️  Failed to fetch tournament results:', resultsError);
        } else if (tournamentResults && tournamentResults.length > 0) {
          console.log(`📋 Processing ${tournamentResults.length} athlete results`);
          
          // Tier bonuses for strength calculation
          const TIER_BONUSES: Record<string, number> = {
            tier1: 0.15,
            tier2: 0.07,
            tier3: 0.03,
            unranked: 0,
          };
          
          // Fantasy price bands
          const FANTASY_PRICE_BANDS: Record<string, { base: number; maxMultiplier: number }> = {
            tier1: { base: 12000, maxMultiplier: 1.5 },
            tier2: { base: 8000, maxMultiplier: 1.3 },
            tier3: { base: 5000, maxMultiplier: 1.2 },
            unranked: { base: 3000, maxMultiplier: 1.1 },
          };
          
          for (const resultRow of tournamentResults) {
            const discipline = resultRow.discipline;
            const position = resultRow.final_overall_rank; // Use final_overall_rank instead of position
            const athleteId = resultRow.athlete_id;
            
            // Fetch current athlete data
            const { data: athlete, error: athleteError } = await supabaseClient
              .from('athletes')
              .select('*')
              .eq('id', athleteId)
              .single();
            
            if (athleteError || !athlete) {
              console.log(`⚠️  Could not find athlete ${athleteId}`);
              continue;
            }
            
            // Build update object for this discipline
            const updates: Record<string, unknown> = {};
            
            // Increment event counts
            const careerEventsKey = `career_events_${discipline}`;
            const seasonEventsKey = `season_events_${discipline}`;
            updates[careerEventsKey] = (athlete[careerEventsKey] || 0) + 1;
            updates[seasonEventsKey] = (athlete[seasonEventsKey] || 0) + 1;
            
            // Handle wins and podiums
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
            
            // Handle top 8
            if (position && position <= 8) {
              const careerTop8Key = `career_top8_${discipline}`;
              updates[careerTop8Key] = (athlete[careerTop8Key] || 0) + 1;
            }
            
            // Update last 5 results
            const last5Key = `last_5_results_${discipline}`;
            const currentLast5 = (athlete[last5Key] as Array<{ position: number; score: number }>) || [];
            const newLast5 = [
              { position: position || 99, score: resultRow.score_raw || 0 },
              ...currentLast5
            ].slice(0, 5);
            updates[last5Key] = newLast5;
            
            // Calculate season avg place from last 5
            const avgPlace = newLast5.reduce((sum, r) => sum + (r.position || 20), 0) / newLast5.length;
            const seasonAvgPlaceKey = `season_avg_place_${discipline}`;
            updates[seasonAvgPlaceKey] = avgPlace;
            
            // Recalculate strength score
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
            
            // Recalculate fantasy price
            const band = FANTASY_PRICE_BANDS[tier] || FANTASY_PRICE_BANDS.unranked;
            const multiplier = 1 + (seasonPodiumRate * (band.maxMultiplier - 1));
            let fantasyPrice = Math.round(band.base * multiplier);
            fantasyPrice = Math.max(2000, Math.min(20000, fantasyPrice));
            
            const fantasyPriceKey = `fantasy_price_${discipline}`;
            updates[fantasyPriceKey] = fantasyPrice;
            
            // Apply the updates
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

    console.log(`\n🎉 Settlement complete:`);
    console.log(`   ✅ ${result.settled_predictions} predictions settled`);
    console.log(`   💰 ${result.total_payout} tokens paid out`);
    console.log(`   👥 ${result.affected_users} users affected`);
    console.log(`   📋 ${result.debug_info!.selection_ids_with_predictions.length} selections had predictions`);
    console.log(`   ⚠️  ${result.debug_info!.selection_ids_without_predictions.length} selections had no predictions`);
    if (result.errors && result.errors.length > 0) {
      console.log(`   ❌ ${result.errors.length} errors occurred`);
    }

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
