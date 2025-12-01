import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SettlementRequest {
  selections: Array<{
    selection_id: string;
    result: 'won' | 'lost' | 'void';
  }>;
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

    const { selections }: SettlementRequest = await req.json();

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

          if (selectionResult === 'won') {
            // Update prediction to WON and set payout
            const { error: updateError } = await supabaseClient
              .from('predictions')
              .update({
                status: 'WON',
                payout_tokens: prediction.potential_payout,
                settled_at: new Date().toISOString(),
              })
              .eq('id', prediction.id);

            if (updateError) {
              result.errors?.push(`Failed to update prediction ${prediction.id}: ${updateError.message}`);
              console.error(`❌ Prediction update error:`, updateError);
              continue;
            }

            // Credit user wallet with winnings
            const { error: walletError } = await supabaseClient.rpc('increment_earned_tokens', {
              user_id_param: prediction.user_id,
              amount: prediction.potential_payout,
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

            result.total_payout += prediction.potential_payout;
            result.settled_predictions += 1;

            // Update lifetime winnings in profile
            const winAmount = prediction.potential_payout - prediction.staked_tokens;
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

            console.log(`✅ WON: ${prediction.id} → +${prediction.potential_payout} tokens to user ${prediction.user_id}`);
          } else if (selectionResult === 'lost') {
            // Update prediction to LOST
            const { error: updateError } = await supabaseClient
              .from('predictions')
              .update({
                status: 'LOST',
                payout_tokens: 0,
                settled_at: new Date().toISOString(),
              })
              .eq('id', prediction.id);

            if (updateError) {
              result.errors?.push(`Failed to update prediction ${prediction.id}: ${updateError.message}`);
              console.error(`❌ Prediction update error:`, updateError);
              continue;
            }

            result.settled_predictions += 1;

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
            // Refund stake for void predictions
            const { error: updateError } = await supabaseClient
              .from('predictions')
              .update({
                status: 'VOID',
                payout_tokens: prediction.staked_tokens,
                settled_at: new Date().toISOString(),
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

    // Mark tournament as settled
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
