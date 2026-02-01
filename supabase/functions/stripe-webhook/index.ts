import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
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

// Process referral bonus for first-time purchase
async function processReferralBonus(
  supabaseClient: any,
  userId: string,
  tokenAmount: number,
  purchaseAmountUsd: number,
  paymentIntentId: string
): Promise<{ bonusTokens: number; referrerReward: number } | null> {
  logStep("Checking referral eligibility", { userId });

  // Get user profile with referral info
  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('referred_by_code_id, first_purchase_at')
    .eq('id', userId)
    .single();

  if (profileError || !profile) {
    logStep("No profile found or error", { error: profileError?.message });
    return null;
  }

  // Check if this is a first purchase AND has a referral code
  if (profile.first_purchase_at) {
    logStep("Not first purchase, skipping referral bonus");
    return null;
  }

  if (!profile.referred_by_code_id) {
    logStep("No referral code attached to user");
    // Still mark first_purchase_at even without referral
    await supabaseClient
      .from('profiles')
      .update({ first_purchase_at: new Date().toISOString() })
      .eq('id', userId);
    return null;
  }

  // Get referral code details
  const { data: referralCode, error: codeError } = await supabaseClient
    .from('referral_codes')
    .select('*')
    .eq('id', profile.referred_by_code_id)
    .single();

  if (codeError || !referralCode) {
    logStep("Referral code not found", { codeId: profile.referred_by_code_id });
    return null;
  }

  if (!referralCode.is_active) {
    logStep("Referral code is inactive");
    return null;
  }

  logStep("Processing referral bonus", {
    code: referralCode.code,
    type: referralCode.type,
    bonusMultiplier: referralCode.bonus_multiplier,
    rewardPct: referralCode.referrer_reward_pct,
  });

  // Calculate bonus tokens: purchased × (multiplier - 1)
  // e.g., 100 tokens × (1.5 - 1) = 50 bonus tokens
  const bonusTokens = Math.floor(tokenAmount * (referralCode.bonus_multiplier - 1));
  
  // Calculate referrer reward
  const referrerReward = purchaseAmountUsd * referralCode.referrer_reward_pct;

  logStep("Bonus calculation", { bonusTokens, referrerReward });

  // Credit bonus tokens to user's earned_tokens
  if (bonusTokens > 0) {
    const { data: wallet, error: walletError } = await supabaseClient
      .from('token_wallets')
      .select('earned_tokens')
      .eq('user_id', userId)
      .single();

    if (!walletError && wallet) {
      const newEarned = (wallet.earned_tokens || 0) + bonusTokens;
      await supabaseClient
        .from('token_wallets')
        .update({ 
          earned_tokens: newEarned,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      // Log bonus transaction
      await supabaseClient
        .from('token_transactions')
        .insert({
          user_id: userId,
          type: 'bonus',
          amount: bonusTokens,
          balance_after: newEarned,
          description: `Referral bonus (${referralCode.code}) - +${((referralCode.bonus_multiplier - 1) * 100).toFixed(0)}% on first purchase`,
          reference_type: 'referral',
          reference_id: referralCode.id,
        });

      logStep("Bonus tokens credited to user", { bonusTokens, newEarned });
    }
  }

  // Create redemption record
  const { error: redemptionError } = await supabaseClient
    .from('referral_redemptions')
    .insert({
      referral_code_id: referralCode.id,
      referred_user_id: userId,
      referrer_user_id: referralCode.owner_user_id,
      purchase_id: paymentIntentId,
      purchase_amount_tokens: tokenAmount,
      purchase_amount_usd: purchaseAmountUsd,
      bonus_tokens_awarded: bonusTokens,
      referrer_reward_value: referrerReward,
      referrer_reward_type: referralCode.reward_type,
    });

  if (redemptionError) {
    logStep("Error creating redemption record", { error: redemptionError.message });
  } else {
    logStep("Redemption record created");
  }

  // If reward type is tokens AND there's an owner, auto-credit tokens to referrer
  if (referralCode.reward_type === 'tokens' && referralCode.owner_user_id && referrerReward > 0) {
    // Convert USD reward to tokens (100 tokens = $1)
    const referrerTokens = Math.floor(referrerReward * 100);
    
    const { data: referrerWallet } = await supabaseClient
      .from('token_wallets')
      .select('earned_tokens')
      .eq('user_id', referralCode.owner_user_id)
      .single();

    if (referrerWallet) {
      const newReferrerEarned = (referrerWallet.earned_tokens || 0) + referrerTokens;
      await supabaseClient
        .from('token_wallets')
        .update({ 
          earned_tokens: newReferrerEarned,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', referralCode.owner_user_id);

      // Log referrer reward transaction
      await supabaseClient
        .from('token_transactions')
        .insert({
          user_id: referralCode.owner_user_id,
          type: 'bonus',
          amount: referrerTokens,
          balance_after: newReferrerEarned,
          description: `Referral reward for code ${referralCode.code}`,
          reference_type: 'referral_reward',
          reference_id: referralCode.id,
        });

      // Mark as paid since tokens were auto-credited
      await supabaseClient
        .from('referral_redemptions')
        .update({ referrer_paid_at: new Date().toISOString() })
        .eq('purchase_id', paymentIntentId);

      logStep("Referrer tokens credited", { referrerTokens, referrerUserId: referralCode.owner_user_id });
    }
  }

  // Update first_purchase_at on profile
  await supabaseClient
    .from('profiles')
    .update({ first_purchase_at: new Date().toISOString() })
    .eq('id', userId);

  logStep("Marked first purchase complete");

  return { bonusTokens, referrerReward };
}

serve(async (req) => {
  try {
    logStep("Webhook received");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      logStep("No Stripe signature found");
      return new Response("No signature", { status: 400 });
    }

    const body = await req.text();
    let event: Stripe.Event;

    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
      logStep("Webhook signature verified", { eventType: event.type, eventId: event.id });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logStep("Webhook signature verification failed", { error: errorMessage });
      return new Response(`Webhook Error: ${errorMessage}`, { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      logStep("Processing checkout.session.completed", { sessionId: session.id });

      const userId = session.metadata?.user_id;
      const tokenAmount = parseInt(session.metadata?.token_amount || "0", 10);
      const packName = session.metadata?.pack_name || "Token Pack";

      if (!userId || tokenAmount <= 0) {
        logStep("Invalid metadata", { userId, tokenAmount });
        return new Response("Invalid metadata", { status: 400 });
      }

      logStep("Extracted metadata", { userId, tokenAmount, packName });

      // Initialize Supabase client with service role key for admin operations
      const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false } }
      );

      // Get current wallet balance
      const { data: wallet, error: walletError } = await supabaseClient
        .from("token_wallets")
        .select("purchased_tokens, earned_tokens")
        .eq("user_id", userId)
        .maybeSingle();

      if (walletError) {
        logStep("Error fetching wallet", { error: walletError.message });
        throw new Error(`Failed to fetch wallet: ${walletError.message}`);
      }

      const currentPurchased = wallet?.purchased_tokens ?? 0;
      const currentEarned = wallet?.earned_tokens ?? 0;
      const newPurchased = currentPurchased + tokenAmount;
      const newBalance = newPurchased + currentEarned;

      logStep("Wallet calculation", { currentPurchased, tokenAmount, newPurchased, newBalance });

      // Update wallet
      const { error: updateError } = await supabaseClient
        .from("token_wallets")
        .update({ 
          purchased_tokens: newPurchased,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", userId);

      if (updateError) {
        logStep("Error updating wallet", { error: updateError.message });
        throw new Error(`Failed to update wallet: ${updateError.message}`);
      }

      logStep("Wallet updated successfully", { newPurchased });

      // Create transaction record
      const { error: transactionError } = await supabaseClient
        .from("token_transactions")
        .insert({
          user_id: userId,
          type: "purchase",
          amount: tokenAmount,
          balance_after: newBalance,
          description: `Purchased ${packName} - ${tokenAmount} tokens`,
          reference_type: "stripe_payment",
          reference_id: session.payment_intent as string,
        });

      if (transactionError) {
        logStep("Error creating transaction", { error: transactionError.message });
        // Don't throw here - wallet is already updated
      } else {
        logStep("Transaction record created");
      }

      // Log to deposit_ledger for global solvency tracking
      // Convert tokens to USD: 100 tokens = $1 (token_value_usd = 0.01)
      const depositAmountUsd = tokenAmount * 0.01;
      const { error: ledgerError } = await supabaseClient
        .from("deposit_ledger")
        .insert({
          user_id: userId,
          transaction_type: "deposit",
          amount_usd: depositAmountUsd,
          tokens_amount: tokenAmount,
          stripe_payment_intent_id: session.payment_intent as string,
          stripe_session_id: session.id,
          description: `Token purchase: ${packName} (${tokenAmount} tokens)`,
        });

      if (ledgerError) {
        logStep("Error logging to deposit_ledger", { error: ledgerError.message });
        // Don't throw - this is for tracking, not critical path
      } else {
        logStep("Deposit logged to ledger", { amountUsd: depositAmountUsd });
      }

      // Update profile lifetime_deposited
      const { data: profile } = await supabaseClient
        .from("profiles")
        .select("lifetime_deposited")
        .eq("id", userId)
        .single();

      const currentDeposited = profile?.lifetime_deposited ?? 0;
      await supabaseClient
        .from("profiles")
        .update({ lifetime_deposited: currentDeposited + tokenAmount })
        .eq("id", userId);

      // === PROCESS REFERRAL BONUS ===
      const referralResult = await processReferralBonus(
        supabaseClient,
        userId,
        tokenAmount,
        depositAmountUsd,
        session.payment_intent as string
      );

      if (referralResult) {
        logStep("Referral bonus applied", referralResult);
      }

      // Write audit log for token purchase
      await writeAuditLog(supabaseClient, {
        actor_type: 'system',
        action_type: 'TOKENS_PURCHASED',
        entity_type: 'token_transaction',
        entity_id: session.payment_intent as string || session.id,
        before_state: {
          purchased_tokens: currentPurchased,
          earned_tokens: currentEarned,
        },
        after_state: {
          purchased_tokens: newPurchased,
          total_balance: newBalance,
          referral_bonus: referralResult?.bonusTokens || 0,
        },
        metadata: {
          user_id: userId,
          token_amount: tokenAmount,
          pack_name: packName,
          stripe_session_id: session.id,
          referral_applied: !!referralResult,
        }
      });

      logStep("Checkout session processed successfully", { userId, tokenAmount, referralApplied: !!referralResult });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
