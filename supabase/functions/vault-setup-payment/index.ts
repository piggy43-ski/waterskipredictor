/**
 * THE VAULT — card capture before the first bid.
 * action=init    -> ensure Stripe customer + SetupIntent, return client secret
 * action=confirm -> persist shipping + payment method, mark bidder verified
 */
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "Not signed in" }, 401);
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user?.email) return json({ error: "Not signed in" }, 401);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "init";

    const { data: profile } = await admin
      .from("vault_bidder_profiles").select("*").eq("user_id", user.id).maybeSingle();

    // Reuse or create the Stripe customer
    let customerId = profile?.stripe_customer_id as string | null;
    if (!customerId) {
      const existing = await stripe.customers.list({ email: user.email, limit: 1 });
      customerId = existing.data[0]?.id ??
        (await stripe.customers.create({ email: user.email, metadata: { user_id: user.id, source: "vault" } })).id;
      await admin.from("vault_bidder_profiles")
        .upsert({ user_id: user.id, stripe_customer_id: customerId }, { onConflict: "user_id" });
    }

    if (action === "init") {
      const intent = await stripe.setupIntents.create({
        customer: customerId,
        usage: "off_session",
        payment_method_types: ["card"],
        metadata: { user_id: user.id, source: "vault" },
      });
      return json({
        client_secret: intent.client_secret,
        publishable_key: Deno.env.get("STRIPE_PUBLISHABLE_KEY") ?? null,
        customer_id: customerId,
      });
    }

    if (action === "confirm") {
      const pmId: string | undefined = body.payment_method_id;
      const shipping = body.shipping ?? {};
      if (!pmId) return json({ error: "Missing payment method" }, 400);

      // Make sure the card belongs to this customer and is reusable off-session
      const pm = await stripe.paymentMethods.retrieve(pmId);
      if (pm.customer && pm.customer !== customerId) return json({ error: "Card mismatch" }, 400);
      if (!pm.customer) await stripe.paymentMethods.attach(pmId, { customer: customerId! });
      await stripe.customers.update(customerId!, { invoice_settings: { default_payment_method: pmId } });

      // Derive the shipping zone from the state the bidder entered
      let zone: number | null = null;
      if (!shipping.local_pickup && shipping.state) {
        const { data: zones } = await admin.from("vault_shipping_zones").select("zone, states");
        const st = String(shipping.state).trim().toUpperCase();
        zone = (zones ?? []).find((z: any) => (z.states ?? []).includes(st))?.zone ?? null;
        if (zone === null) return json({ error: "We do not ship to that state yet" }, 400);
      }

      const { error } = await admin.from("vault_bidder_profiles").upsert({
        user_id: user.id,
        stripe_customer_id: customerId,
        stripe_payment_method_id: pmId,
        payment_method_last4: pm.card?.last4 ?? null,
        payment_method_brand: pm.card?.brand ?? null,
        is_verified: true,
        full_name: shipping.full_name ?? null,
        phone: shipping.phone ?? null,
        address_line1: shipping.address_line1 ?? null,
        address_line2: shipping.address_line2 ?? null,
        city: shipping.city ?? null,
        state: shipping.state ?? null,
        postal_code: shipping.postal_code ?? null,
        country: "US",
        local_pickup: !!shipping.local_pickup,
        shipping_zone: shipping.local_pickup ? null : zone,
        bidding_terms_accepted_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) throw error;

      return json({ success: true, brand: pm.card?.brand, last4: pm.card?.last4, shipping_zone: zone });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[VAULT-SETUP-PAYMENT]", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});