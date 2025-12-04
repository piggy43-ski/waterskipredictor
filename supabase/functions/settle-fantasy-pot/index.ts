import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Payout structures
const PAYOUT_STRUCTURES: Record<string, Record<number, number>> = {
  winner_takes_all: { 1: 100 },
  top_3_split: { 1: 50, 2: 30, 3: 20 },
  top_5_split: { 1: 40, 2: 25, 3: 18, 4: 10, 5: 7 },
  top_10_split: { 1: 30, 2: 20, 3: 15, 4: 10, 5: 8, 6: 6, 7: 4, 8: 3, 9: 2, 10: 2 }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pot_id } = await req.json();

    if (!pot_id) {
      throw new Error('pot_id is required');
    }

    console.log(`Settling fantasy pot: ${pot_id}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get pot details
    const { data: pot, error: potError } = await supabase
      .from('fantasy_pots')
      .select('*')
      .eq('id', pot_id)
      .single();

    if (potError) throw potError;

    if (pot.status === 'settled') {
      throw new Error('Pot is already settled');
    }

    // Get all entries sorted by points
    const { data: entries, error: entriesError } = await supabase
      .from('fantasy_entries')
      .select('id, user_id, total_points, team_name')
      .eq('pot_id', pot_id)
      .order('total_points', { ascending: false });

    if (entriesError) throw entriesError;

    if (!entries || entries.length === 0) {
      // No entries - just mark as settled
      await supabase
        .from('fantasy_pots')
        .update({ status: 'settled' })
        .eq('id', pot_id);

      return new Response(JSON.stringify({
        success: true,
        message: 'No entries to settle'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate prize pool
    const totalPool = entries.length * pot.entry_fee_tokens;
    const houseRake = Math.floor(totalPool * (pot.house_rake_percent / 100));
    const netPrizePool = totalPool - houseRake;

    console.log(`Total pool: ${totalPool}, House rake: ${houseRake}, Net prize: ${netPrizePool}`);

    // Get payout structure
    const payoutStructure = PAYOUT_STRUCTURES[pot.payout_structure] || PAYOUT_STRUCTURES.top_3_split;

    // Calculate and distribute payouts
    const payouts: { user_id: string; amount: number; rank: number }[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const rank = i + 1;
      const payoutPercent = payoutStructure[rank];

      // Update entry rank
      await supabase
        .from('fantasy_entries')
        .update({ rank })
        .eq('id', entry.id);

      if (payoutPercent) {
        const payoutAmount = Math.floor(netPrizePool * (payoutPercent / 100));
        payouts.push({ user_id: entry.user_id, amount: payoutAmount, rank });
      }
    }

    // Process payouts
    for (const payout of payouts) {
      // Get current wallet balance
      const { data: wallet, error: walletError } = await supabase
        .from('token_wallets')
        .select('earned_tokens')
        .eq('user_id', payout.user_id)
        .single();

      if (walletError) {
        console.error(`Error fetching wallet for user ${payout.user_id}:`, walletError);
        continue;
      }

      const newBalance = (wallet?.earned_tokens || 0) + payout.amount;

      // Update wallet
      const { error: updateWalletError } = await supabase
        .from('token_wallets')
        .update({ earned_tokens: newBalance })
        .eq('user_id', payout.user_id);

      if (updateWalletError) {
        console.error(`Error updating wallet for user ${payout.user_id}:`, updateWalletError);
        continue;
      }

      // Log transaction
      await supabase
        .from('token_transactions')
        .insert({
          user_id: payout.user_id,
          type: 'fantasy_payout',
          amount: payout.amount,
          balance_after: newBalance,
          description: `Fantasy payout: ${pot.name} - #${payout.rank} place`,
          reference_id: pot_id,
          reference_type: 'fantasy_pot'
        });

      console.log(`Paid ${payout.amount} tokens to user ${payout.user_id} for rank #${payout.rank}`);
    }

    // Update pot status
    await supabase
      .from('fantasy_pots')
      .update({ status: 'settled' })
      .eq('id', pot_id);

    console.log(`Fantasy pot ${pot_id} settled successfully`);

    return new Response(JSON.stringify({
      success: true,
      total_pool: totalPool,
      house_rake: houseRake,
      net_prize_pool: netPrizePool,
      payouts: payouts.map(p => ({ rank: p.rank, amount: p.amount }))
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in settle-fantasy-pot:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
