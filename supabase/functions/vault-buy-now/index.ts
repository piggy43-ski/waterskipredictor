/**
 * THE VAULT — Buy It Now via Stripe Checkout.
 * Row-locked through vault_claim_buy_now so two people can never buy the
 * same one-of-one lot.
 */
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (!user?.email) return json({ error: "Sign in to buy" }, 401);

    const { ski_id } = await req.json();
    if (!ski_id) return json({ error: "Missing lot" }, 400);

    const { data: profile } = await supabase
      .from("vault_bidder_profiles")
      .select("stripe_customer_id, shipping_zone, local_pickup, is_verified")
      .eq("user_id", user.id).maybeSingle();

    let shipping = 0;
    if (profile && !profile.local_pickup && profile.shipping_zone) {
      const { data: zone } = await supabase.from("vault_shipping_zones")
        .select("price").eq("zone", profile.shipping_zone).maybeSingle();
      shipping = Number(zone?.price ?? 0);
    }

    // Atomically claim the lot (row lock inside the function)
    const { data: claim, error: claimErr } = await supabase.rpc("vault_claim_buy_now", {
      p_ski_id: ski_id, p_user_id: user.id, p_shipping: shipping,
    });
    if (claimErr) return json({ error: claimErr.message }, 400);
    const claimed = claim as { order_id: string; price: number; total: number; title: string };

    const origin = req.headers.get("origin") ?? Deno.env.get("APP_URL") ?? "";
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: Math.round(Number(claimed.price) * 100),
        product_data: { name: `The Vault — ${claimed.title}` },
      },
    }];
    if (shipping > 0) {
      line_items.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(shipping * 100),
          product_data: { name: "Shipping" },
        },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: profile?.stripe_customer_id ?? undefined,
      customer_email: profile?.stripe_customer_id ? undefined : user.email,
      line_items,
      success_url: `${origin}/vault/account?purchased=1`,
      cancel_url: `${origin}/vault/ski/${ski_id}?cancelled=1`,
      metadata: { vault_order_id: claimed.order_id, ski_id, user_id: user.id, source: "vault_buy_now" },
      payment_intent_data: { metadata: { vault_order_id: claimed.order_id, source: "vault_buy_now" } },
    }, { idempotencyKey: `vault-buynow-${claimed.order_id}` });

    return json({ url: session.url, order_id: claimed.order_id, total: claimed.total });
  } catch (e) {
    console.error("[VAULT-BUY-NOW]", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});