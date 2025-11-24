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

    console.log(`Processing settlement for ${selections.length} selections`);

    const result: SettlementResult = {
      success: true,
      settled_predictions: 0,
      total_payout: 0,
      affected_users: 0,
      errors: [],
    };

    const affectedUserIds = new Set<string>();

    // Process each selection
    for (const { selection_id, result: selectionResult } of selections) {
      try {
        // Update selection result
        const { error: selectionError } = await supabaseClient
          .from('selections')
          .update({ result: selectionResult })
          .eq('id', selection_id);

        if (selectionError) {
          result.errors?.push(`Failed to update selection ${selection_id}: ${selectionError.message}`);
          continue;
        }

        // Get all pending predictions for this selection
        const { data: predictions, error: predError } = await supabaseClient
          .from('predictions')
          .select('*')
          .eq('selection_id', selection_id)
          .eq('status', 'PENDING');

        if (predError) {
          result.errors?.push(`Failed to fetch predictions for ${selection_id}: ${predError.message}`);
          continue;
        }

        if (!predictions || predictions.length === 0) {
          console.log(`No pending predictions for selection ${selection_id}`);
          continue;
        }

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
              continue;
            }

            // Credit user wallet with winnings
            const { error: walletError } = await supabaseClient.rpc('increment_earned_tokens', {
              user_id_param: prediction.user_id,
              amount: prediction.potential_payout,
            });

            if (walletError) {
              // If wallet update fails, we need to rollback the prediction update
              await supabaseClient
                .from('predictions')
                .update({
                  status: 'PENDING',
                  payout_tokens: null,
                  settled_at: null,
                })
                .eq('id', prediction.id);

              result.errors?.push(`Failed to update wallet for prediction ${prediction.id}: ${walletError.message}`);
              continue;
            }

            result.total_payout += prediction.potential_payout;
            result.settled_predictions += 1;

            console.log(`Settled WON prediction ${prediction.id}: +${prediction.potential_payout} tokens to user ${prediction.user_id}`);
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
              continue;
            }

            result.settled_predictions += 1;
            console.log(`Settled LOST prediction ${prediction.id}`);
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
              continue;
            }

            result.total_payout += prediction.staked_tokens;
            result.settled_predictions += 1;

            console.log(`Settled VOID prediction ${prediction.id}: refunded ${prediction.staked_tokens} tokens to user ${prediction.user_id}`);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors?.push(`Error processing selection ${selection_id}: ${errorMessage}`);
      }
    }

    result.affected_users = affectedUserIds.size;

    console.log(`Settlement complete: ${result.settled_predictions} predictions, ${result.total_payout} tokens paid out to ${result.affected_users} users`);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Settlement error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
