import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

/**
 * THE VAULT — auction closer.
 * Finds live auction lots whose closes_at has passed, decides the outcome
 * against the hidden reserve, and creates an order for the winner.
 * Idempotent: only touches lots still in 'live' status, one order per lot.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const { data: due, error } = await supabase
      .from('vault_skis')
      .select('id, title, current_price, reserve_price, bid_count, highest_bidder_id, closes_at')
      .eq('status', 'live')
      .eq('listing_type', 'auction')
      .lte('closes_at', new Date().toISOString());

    if (error) throw error;

    const results: Record<string, unknown>[] = [];

    for (const lot of due ?? []) {
      const price = Number(lot.current_price ?? 0);
      const reserve = lot.reserve_price === null ? null : Number(lot.reserve_price);
      const hasWinner = !!lot.bid_count && !!lot.highest_bidder_id;
      const reserveMet = reserve === null || price >= reserve;

      if (!hasWinner || !reserveMet) {
        await supabase
          .from('vault_skis')
          .update({ status: 'ended_no_reserve_met' })
          .eq('id', lot.id)
          .eq('status', 'live');
        results.push({ lot: lot.id, outcome: 'no_sale', price, reserve_met: reserveMet });
        continue;
      }

      // Shipping for the winner
      const { data: profile } = await supabase
        .from('vault_bidder_profiles')
        .select('shipping_zone, local_pickup')
        .eq('user_id', lot.highest_bidder_id)
        .maybeSingle();

      let shipping = 0;
      if (profile && !profile.local_pickup && profile.shipping_zone) {
        const { data: zone } = await supabase
          .from('vault_shipping_zones')
          .select('price')
          .eq('zone', profile.shipping_zone)
          .maybeSingle();
        shipping = Number(zone?.price ?? 0);
      }

      const { data: existing } = await supabase
        .from('vault_orders')
        .select('id')
        .eq('ski_id', lot.id)
        .maybeSingle();

      if (!existing) {
        const { error: orderErr } = await supabase.from('vault_orders').insert({
          ski_id: lot.id,
          user_id: lot.highest_bidder_id,
          hammer_price: price,
          shipping_cost: shipping,
          total: price + shipping,
          status: 'pending_charge',
        });
        if (orderErr) throw orderErr;
      }

      await supabase
        .from('vault_skis')
        .update({ status: 'ended_met' })
        .eq('id', lot.id)
        .eq('status', 'live');

      results.push({ lot: lot.id, outcome: 'sold', price, shipping, total: price + shipping });
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});