/**
 * THE VAULT — mark an order shipped and email the buyer tracking.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { sendVaultEmail, esc } from "../_shared/vaultEmail.ts";

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
    if (!userData?.user) return json({ error: "Not signed in" }, 401);
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "Admin only" }, 403);

    const { order_id, tracking_number, carrier } = await req.json();
    if (!order_id || !tracking_number) return json({ error: "Missing order or tracking" }, 400);

    const { data: order } = await supabase.from("vault_orders").select("*").eq("id", order_id).maybeSingle();
    if (!order) return json({ error: "Order not found" }, 404);

    await supabase.from("vault_orders").update({
      status: "shipped", shipped_at: new Date().toISOString(), tracking_number,
    }).eq("id", order_id);

    const { data: lot } = await supabase.from("vault_skis").select("title").eq("id", order.ski_id).maybeSingle();

    await sendVaultEmail(supabase, {
      userId: order.user_id,
      subject: `Shipped — ${lot?.title ?? "your Vault order"}`,
      title: "It's on the way",
      body: `<p><strong>${esc(lot?.title ?? "Your lot")}</strong> has shipped.</p>
        <p>${carrier ? esc(carrier) + " — " : ""}Tracking: <strong>${esc(tracking_number)}</strong></p>`,
    });

    return json({ success: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});