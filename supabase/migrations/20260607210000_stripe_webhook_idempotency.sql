-- ============================================================
-- Stripe webhook idempotency + atomic wallet credits
-- Fixes: duplicate webhook deliveries double-crediting tokens,
-- and non-atomic read-modify-write wallet updates (race condition).
-- ============================================================

-- 1. Idempotency ledger: one row per processed Stripe event.
CREATE TABLE IF NOT EXISTS public.processed_stripe_events (
  event_id text PRIMARY KEY,
  event_type text,
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- Service role bypasses RLS; enabling RLS with no policies blocks all
-- client access (this table is webhook-internal only).
ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;

-- 2. Atomic wallet credit. Single-statement UPSERT — no read-modify-write
-- window. Returns the new balances so the caller can write accurate
-- transaction records.
CREATE OR REPLACE FUNCTION public.increment_wallet_tokens(
  p_user_id uuid,
  p_purchased_delta integer DEFAULT 0,
  p_earned_delta integer DEFAULT 0
) RETURNS TABLE (purchased_tokens integer, earned_tokens integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.token_wallets AS w (user_id, purchased_tokens, earned_tokens, updated_at)
  VALUES (p_user_id, GREATEST(p_purchased_delta, 0), GREATEST(p_earned_delta, 0), now())
  ON CONFLICT (user_id) DO UPDATE
    SET purchased_tokens = w.purchased_tokens + p_purchased_delta,
        earned_tokens    = w.earned_tokens + p_earned_delta,
        updated_at       = now()
  RETURNING w.purchased_tokens, w.earned_tokens;
END;
$$;

-- 3. Atomic lifetime_deposited increment (replaces select-then-update).
CREATE OR REPLACE FUNCTION public.increment_lifetime_deposited(
  p_user_id uuid,
  p_amount integer
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
  SET lifetime_deposited = COALESCE(lifetime_deposited, 0) + p_amount
  WHERE id = p_user_id;
$$;

-- Lock down execution: only service role needs these.
REVOKE EXECUTE ON FUNCTION public.increment_wallet_tokens(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_lifetime_deposited(uuid, integer) FROM PUBLIC, anon, authenticated;
