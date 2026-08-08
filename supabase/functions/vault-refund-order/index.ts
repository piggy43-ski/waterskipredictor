/**
 * THE VAULT — admin refund. Refunds the Stripe payment, marks the order
 * refunded and relists the lot.
 */
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { sendVaultEmail, usd, esc } from "../_shared/vaultEmail.ts";

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
    if (!user) return json({ error: "Not signed in" }, 401);

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "Admin only" }, 403);

    const { order_id, relist = true } = await req.json();
    if (!order_id) return json({ error: "Missing order" }, 400);

    const { data: order } = await supabase.from("vault_orders").select("*").eq("id", order_id).maybeSingle();
    if (!order) return json({ error: "Order not found" }, 404);
    if (order.status === "refunded") return json({ success: true, already: true });
    if (!order.stripe_payment_intent_id) return json({ error: "No payment to refund" }, 400);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });
    const refund = await stripe.refunds.create(
      { payment_intent: order.stripe_payment_intent_id, reason: "requested_by_customer" },
      { idempotencyKey: `vault-refund-${order.id}` },
    );

    await supabase.from("vault_orders").update({
      status: "refunded", refunded_at: new Date().toISOString(), stripe_refund_id: refund.id,
    }).eq("id", order.id);

    const { data: lot } = await supabase.from("vault_skis").select("title").eq("id", order.ski_id).maybeSingle();

    if (relist) {
      await supabase.from("vault_skis").update({
        status: "live", highest_bidder_id: null, bid_count: 0,
      }).eq("id", order.ski_id);
    }

    await sendVaultEmail(supabase, {
      userId: order.user_id,
      subject: `Refunded — ${lot?.title ?? "Vault order"}`,
      title: "Your order was refunded",
      body: `<p>We've refunded ${usd(order.total)} for <strong>${esc(lot?.title ?? "your Vault order")}</strong>.
        It should land back on your card within a few business days.</p>`,
    });

    return json({ success: true, refund_id: refund.id, relisted: relist });
  } catch (e) {
    console.error("[VAULT-REFUND-ORDER]", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});