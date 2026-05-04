import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Audit log helper
async function writeAuditLog(supabase: any, entry: {
  actor_type: 'admin' | 'system';
  actor_id?: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  before_state?: any;
  after_state?: any;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      actor_type: entry.actor_type,
      actor_id: entry.actor_id || null,
      action_type: entry.action_type,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      before_state: entry.before_state || null,
      after_state: entry.after_state || null,
      metadata: entry.metadata || {},
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

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

    // Verify user is authenticated and is an admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Check if user has admin role
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !roleData) {
      console.error('User is not an admin:', user.id);
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

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

    // Assign competition ranks (ties share the same rank)
    // Example: scores [10, 8, 8, 5] → ranks [1, 2, 2, 4]
    const ranks: number[] = [];
    for (let i = 0; i < entries.length; i++) {
      if (i === 0) {
        ranks.push(1);
      } else if (Number(entries[i].total_points) === Number(entries[i - 1].total_points)) {
        ranks.push(ranks[i - 1]);
      } else {
        ranks.push(i + 1);
      }
    }

    // Persist ranks
    for (let i = 0; i < entries.length; i++) {
      await supabase
        .from('fantasy_entries')
        .update({ rank: ranks[i] })
        .eq('id', entries[i].id);
    }

    // Group entries by rank, then pool the prize percentages for tied ranks
    // and split evenly among the tied entries.
    const payouts: { user_id: string; amount: number; rank: number }[] = [];
    const rankToIndices = new Map<number, number[]>();
    for (let i = 0; i < entries.length; i++) {
      const list = rankToIndices.get(ranks[i]) ?? [];
      list.push(i);
      rankToIndices.set(ranks[i], list);
    }

    for (const [rank, indices] of rankToIndices) {
      // Sum the percentages of all positions occupied by this tied group.
      // E.g. two-way tie for 1st absorbs both the 1st and 2nd payout slots.
      let pooledPercent = 0;
      for (let offset = 0; offset < indices.length; offset++) {
        const slotPosition = rank + offset;
        pooledPercent += payoutStructure[slotPosition] || 0;
      }
      if (pooledPercent <= 0) continue;

      const pooledAmount = Math.floor(netPrizePool * (pooledPercent / 100));
      const perEntry = Math.floor(pooledAmount / indices.length);
      if (perEntry <= 0) continue;

      for (const idx of indices) {
        payouts.push({ user_id: entries[idx].user_id, amount: perEntry, rank });
      }
    }

    // Process payouts atomically using database function (prevents race conditions)
    for (const payout of payouts) {
      // Atomically increment earned tokens
      const { error: incrementError } = await supabase
        .rpc('increment_earned_tokens', {
          user_id_param: payout.user_id,
          amount: payout.amount
        });

      if (incrementError) {
        console.error(`Error updating wallet for user ${payout.user_id}:`, incrementError);
        continue;
      }

      // Get the new balance for transaction logging
      const { data: wallet } = await supabase
        .from('token_wallets')
        .select('earned_tokens, purchased_tokens')
        .eq('user_id', payout.user_id)
        .single();

      const newBalance = (wallet?.earned_tokens || 0) + (wallet?.purchased_tokens || 0);

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

    // Write audit log for fantasy pot settlement
    await writeAuditLog(supabase, {
      actor_type: 'admin',
      actor_id: user.id,
      action_type: 'FANTASY_POT_SETTLED',
      entity_type: 'fantasy_pot',
      entity_id: pot_id,
      before_state: {
        status: pot.status,
        entries_count: entries.length,
      },
      after_state: {
        status: 'settled',
        total_pool: totalPool,
        house_rake: houseRake,
        net_prize_pool: netPrizePool,
        payouts: payouts.map(p => ({ rank: p.rank, amount: p.amount })),
      },
      metadata: {
        pot_name: pot.name,
        payout_structure: pot.payout_structure,
        entry_fee: pot.entry_fee_tokens,
      }
    });

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
