/**
 * THE VAULT — winner charging.
 * Every charge is keyed on the order id so a retried cron run can never
 * double-charge a buyer.
 */
import Stripe from "https://esm.sh/stripe@18.5.0";
import { sendVaultEmail, adminEmail, usd, esc } from "../_shared/vaultEmail.ts";

export const MAX_ATTEMPTS = 3;
const RETRY_HOURS = [6, 24];

export async function chargeOrder(supabase: any, stripe: Stripe, orderId: string) {
  const { data: order } = await supabase.from("vault_orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) return { order_id: orderId, outcome: "missing" };
  if (order.status === "paid" || order.status === "refunded" || order.status === "cancelled") {
    return { order_id: orderId, outcome: "skipped", status: order.status };
  }

  const { data: lot } = await supabase.from("vault_skis").select("title").eq("id", order.ski_id).maybeSingle();
  const { data: profile } = await supabase
    .from("vault_bidder_profiles")
    .select("stripe_customer_id, stripe_payment_method_id, full_name")
    .eq("user_id", order.user_id).maybeSingle();

  const title = lot?.title ?? "Vault lot";
  const appUrl = Deno.env.get("APP_URL") ?? "";

  // Already has an intent? Never create a second one — resolve the existing one.
  if (order.stripe_payment_intent_id) {
    const existing = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);
    if (existing.status === "succeeded") {
      await markPaid(supabase, order, existing.id, title, appUrl);
      return { order_id: orderId, outcome: "already_paid" };
    }
    if (existing.status === "requires_action" || existing.status === "requires_confirmation") {
      return { order_id: orderId, outcome: "awaiting_customer_action" };
    }
  }

  if (!profile?.stripe_customer_id || !profile?.stripe_payment_method_id) {
    return await fail(supabase, order, title, "No saved payment method on file", false);
  }

  const attempt = Number(order.charge_attempts ?? 0) + 1;
  const amount = Math.round(Number(order.total) * 100);

  try {
    const intent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      customer: profile.stripe_customer_id,
      payment_method: profile.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      description: `The Vault — ${title}`,
      statement_descriptor: "WSP VAULT",
      statement_descriptor_suffix: "WSP VAULT",
      metadata: { vault_order_id: order.id, ski_id: order.ski_id, user_id: order.user_id, source: "vault" },
    }, { idempotencyKey: `vault-order-${order.id}-a${attempt}` });

    if (intent.status === "succeeded") {
      await markPaid(supabase, order, intent.id, title, appUrl);
      return { order_id: orderId, outcome: "paid", amount: order.total };
    }
    if (intent.status === "requires_action") {
      return await requiresAction(supabase, order, intent, title, appUrl);
    }
    return await fail(supabase, order, title, `Unexpected payment status: ${intent.status}`, true, intent.id);
  } catch (e: any) {
    const code = e?.code ?? e?.raw?.code;
    const intent = e?.raw?.payment_intent ?? e?.payment_intent;
    if (code === "authentication_required" && intent) {
      return await requiresAction(supabase, order, intent, title, appUrl);
    }
    return await fail(supabase, order, title, e?.message ?? "Card declined", true, intent?.id);
  }
}

async function markPaid(supabase: any, order: any, intentId: string, title: string, appUrl: string) {
  await supabase.from("vault_orders").update({
    status: "paid", paid_at: new Date().toISOString(), stripe_payment_intent_id: intentId,
    requires_action: false, hosted_confirm_url: null, last_error: null, next_retry_at: null,
  }).eq("id", order.id).neq("status", "paid");

  await sendVaultEmail(supabase, {
    userId: order.user_id,
    subject: `You won — ${title}`,
    title: "You won the lot",
    body: `
      <p><strong>${esc(title)}</strong> is yours.</p>
      <table style="width:100%;border-collapse:collapse;margin:14px 0">
        <tr><td>Hammer price</td><td align="right">${usd(order.hammer_price)}</td></tr>
        <tr><td>Shipping</td><td align="right">${usd(order.shipping_cost)}</td></tr>
        <tr><td style="border-top:1px solid #3a332c;padding-top:6px"><strong>Charged</strong></td>
            <td align="right" style="border-top:1px solid #3a332c;padding-top:6px"><strong>${usd(order.total)}</strong></td></tr>
      </table>
      <p>Your card on file has been charged ${usd(order.total)}. We'll email tracking as soon as it ships.</p>
      <p><a href="${appUrl}/vault/account" style="color:#c9a227">View your order</a></p>`,
  });
  return true;
}

async function requiresAction(supabase: any, order: any, intent: any, title: string, appUrl: string) {
  const url = intent.next_action?.redirect_to_url?.url ?? `${appUrl}/vault/account`;
  await supabase.from("vault_orders").update({
    stripe_payment_intent_id: intent.id,
    requires_action: true,
    hosted_confirm_url: url,
    last_error: "authentication_required",
    next_retry_at: null,
  }).eq("id", order.id);

  await sendVaultEmail(supabase, {
    userId: order.user_id,
    subject: `Confirm your payment — ${title}`,
    title: "One step left",
    body: `<p>You won <strong>${esc(title)}</strong> for ${usd(order.total)}. Your bank needs you to confirm
      the payment before it goes through — this is normal for many cards outside the US.</p>
      <p><a href="${esc(url)}" style="color:#c9a227">Confirm your payment</a></p>
      <p>Your lot is held for you until you do.</p>`,
  });
  return { order_id: order.id, outcome: "authentication_required" };
}

async function fail(supabase: any, order: any, title: string, message: string, retryable: boolean, intentId?: string) {
  const attempts = Number(order.charge_attempts ?? 0) + 1;
  const remaining = retryable && attempts < MAX_ATTEMPTS;
  const nextRetry = remaining
    ? new Date(Date.now() + RETRY_HOURS[Math.min(attempts - 1, RETRY_HOURS.length - 1)] * 3600_000).toISOString()
    : null;

  await supabase.from("vault_orders").update({
    status: "failed",
    last_error: message.slice(0, 500),
    charge_attempts: attempts,
    next_retry_at: nextRetry,
    stripe_payment_intent_id: intentId ?? order.stripe_payment_intent_id,
  }).eq("id", order.id);

  await sendVaultEmail(supabase, {
    userId: order.user_id,
    subject: `Payment problem — ${title}`,
    title: "We couldn't charge your card",
    body: `<p>Your winning bid on <strong>${esc(title)}</strong> (${usd(order.total)}) could not be charged.</p>
      <p style="color:#b98b8b">${esc(message)}</p>
      <p>${remaining
        ? "We'll try again automatically. You can also update your card in your Vault account."
        : "Please update your card in your Vault account and we'll be in touch."}</p>
      <p><a href="${Deno.env.get("APP_URL") ?? ""}/vault/account" style="color:#c9a227">Update payment method</a></p>`,
  });

  const admin = await adminEmail();
  if (admin) {
    await sendVaultEmail(supabase, {
      to: admin, force: true,
      subject: `[Vault] Charge failed (${attempts}/${MAX_ATTEMPTS}) — ${title}`,
      title: "Charge failed",
      body: `<p>Order <code>${esc(order.id)}</code> — ${usd(order.total)}<br/>${esc(message)}<br/>
        Attempt ${attempts} of ${MAX_ATTEMPTS}. ${remaining ? `Next retry ${esc(nextRetry)}` : "<strong>Manual follow-up needed.</strong>"}</p>`,
    });
  }

  return { order_id: order.id, outcome: "failed", attempts, message };
}