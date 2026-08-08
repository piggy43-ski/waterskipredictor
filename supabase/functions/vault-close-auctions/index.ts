import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import Stripe from 'https://esm.sh/stripe@18.5.0';
import { chargeOrder } from './charge.ts';
import { sendVaultEmail, usd, esc } from '../_shared/vaultEmail.ts';

/**
 * THE VAULT — auction closer.
 * Finds live auction lots whose closes_at has passed, decides the outcome
 * against the hidden reserve, creates an order for the winner and charges
 * their saved card off-session. Also sweeps failed orders due for retry.
 * Idempotent: one order per lot, and every charge is keyed on the order id.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2025-08-27.basil' });

  try {
    const { data: due, error } = await supabase
      .from('vault_skis')
      .select('id, title, current_price, reserve_price, bid_count, highest_bidder_id, closes_at')
      .eq('status', 'live')
      .eq('listing_type', 'auction')
      .lte('closes_at', new Date().toISOString());

    if (error) throw error;

    const results: Record<string, unknown>[] = [];
    const toCharge: string[] = [];

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

      let orderId = existing?.id as string | undefined;
      if (!orderId) {
        const { data: created, error: orderErr } = await supabase.from('vault_orders').insert({
          ski_id: lot.id,
          user_id: lot.highest_bidder_id,
          hammer_price: price,
          shipping_cost: shipping,
          total: price + shipping,
          status: 'pending_charge',
        }).select('id').single();
        if (orderErr) throw orderErr;
        orderId = created.id;
      }
      if (orderId) toCharge.push(orderId);

      await supabase
        .from('vault_skis')
        .update({ status: 'ended_met' })
        .eq('id', lot.id)
        .eq('status', 'live');

      results.push({ lot: lot.id, outcome: 'sold', price, shipping, total: price + shipping });
    }

    // Orders that failed earlier and are due for an automatic retry
    const { data: retries } = await supabase
      .from('vault_orders')
      .select('id')
      .eq('status', 'failed')
      .lt('charge_attempts', 3)
      .not('next_retry_at', 'is', null)
      .lte('next_retry_at', new Date().toISOString());
    for (const r of retries ?? []) if (!toCharge.includes(r.id)) toCharge.push(r.id);

    const charges: unknown[] = [];
    for (const id of toCharge) charges.push(await chargeOrder(supabase, stripe, id));

    // Outbid notifications
    const { data: outbids } = await supabase
      .from('vault_bids')
      .select('id, ski_id, user_id')
      .not('outbid_at', 'is', null)
      .is('outbid_notified_at', null)
      .eq('is_auto', false)
      .limit(200);

    const notified = new Set<string>();
    for (const b of outbids ?? []) {
      const key = `${b.ski_id}:${b.user_id}`;
      if (notified.has(key)) continue;
      notified.add(key);
      const { data: pub } = await supabase
        .from('vault_public_skis')
        .select('title, current_price, status, highest_bidder_id')
        .eq('id', b.ski_id).maybeSingle();
      if (!pub || pub.status !== 'live' || pub.highest_bidder_id === b.user_id) continue;
      await sendVaultEmail(supabase, {
        userId: b.user_id,
        subject: `Outbid — ${pub.title}`,
        title: "You've been outbid",
        body: `<p><strong>${esc(pub.title)}</strong> is now at ${usd(Number(pub.current_price))}.</p>
          <p><a href="${Deno.env.get('APP_URL') ?? ''}/vault/ski/${esc(b.ski_id)}" style="color:#c9a227">Raise your maximum</a></p>`,
      });
    }
    if (outbids?.length) {
      await supabase.from('vault_bids')
        .update({ outbid_notified_at: new Date().toISOString() })
        .in('id', outbids.map((b: { id: string }) => b.id));
    }

    return new Response(JSON.stringify({ processed: results.length, results, charges, outbid_notified: notified.size }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});