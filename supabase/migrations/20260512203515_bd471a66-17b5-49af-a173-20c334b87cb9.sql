
-- Status column with check constraint (text-based, follows existing pattern)
ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'pending_fulfillment',
  ADD COLUMN IF NOT EXISTS shipping_name text,
  ADD COLUMN IF NOT EXISTS shipping_address_line1 text,
  ADD COLUMN IF NOT EXISTS shipping_address_line2 text,
  ADD COLUMN IF NOT EXISTS shipping_city text,
  ADD COLUMN IF NOT EXISTS shipping_state text,
  ADD COLUMN IF NOT EXISTS shipping_zip text,
  ADD COLUMN IF NOT EXISTS shipping_phone text,
  ADD COLUMN IF NOT EXISTS glove_size text,
  ADD COLUMN IF NOT EXISTS gift_card_email text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE public.redemptions
  DROP CONSTRAINT IF EXISTS redemptions_fulfillment_status_check;

ALTER TABLE public.redemptions
  ADD CONSTRAINT redemptions_fulfillment_status_check
  CHECK (fulfillment_status IN ('pending_fulfillment','concierge_review','shipped','fulfilled','cancelled','failed'));

-- Backfill: existing rows without an explicit fulfillment_status get 'pending_fulfillment'
-- (DEFAULT handled this for new column; explicit update for clarity / safety)
UPDATE public.redemptions
SET fulfillment_status = 'pending_fulfillment'
WHERE fulfillment_status IS NULL;

-- Refund RPC
CREATE OR REPLACE FUNCTION public.refund_redemption(
  p_redemption_id uuid,
  p_reason text
)
RETURNS TABLE(success boolean, refunded_tokens integer, new_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_redemption RECORD;
  v_actor uuid;
  v_actor_type text;
  v_new_balance integer;
BEGIN
  v_actor := auth.uid();

  IF v_actor IS NULL THEN
    v_actor_type := 'system';
  ELSIF public.has_role(v_actor, 'admin'::app_role) THEN
    v_actor_type := 'admin';
  ELSE
    RAISE EXCEPTION 'Only admins or service role may refund redemptions';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A non-empty reason is required';
  END IF;

  SELECT * INTO v_redemption
  FROM redemptions
  WHERE id = p_redemption_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Redemption % not found', p_redemption_id;
  END IF;

  IF v_redemption.fulfillment_status NOT IN ('pending_fulfillment','concierge_review','shipped') THEN
    RAISE EXCEPTION 'Cannot refund redemption in status %', v_redemption.fulfillment_status;
  END IF;

  -- Credit tokens back to earned bucket
  UPDATE token_wallets
  SET earned_tokens = earned_tokens + v_redemption.tokens_spent,
      updated_at = now()
  WHERE user_id = v_redemption.user_id
  RETURNING (earned_tokens + purchased_tokens) INTO v_new_balance;

  -- Update redemption
  UPDATE redemptions
  SET fulfillment_status = 'cancelled',
      cancellation_reason = p_reason,
      cancelled_at = now(),
      updated_at = now()
  WHERE id = p_redemption_id;

  -- Update liability
  UPDATE house_rewards_liability
  SET status = 'cancelled',
      notes = COALESCE(notes || E'\n', '') || 'Refunded: ' || p_reason,
      updated_at = now()
  WHERE redemption_id = p_redemption_id;

  -- Ledger entry
  INSERT INTO token_transactions (
    user_id, type, amount, balance_after,
    reference_type, reference_id, description,
    transaction_status, source_type, source_id, counterparty,
    metadata, affects_wallet
  ) VALUES (
    v_redemption.user_id,
    'redemption_refund',
    v_redemption.tokens_spent,
    v_new_balance,
    'redemption',
    p_redemption_id,
    'Refund for cancelled redemption: ' || p_reason,
    'completed',
    'reward',
    v_redemption.reward_id,
    'house',
    jsonb_build_object('reason', p_reason, 'refunded_by', v_actor, 'refunded_at', now()),
    true
  );

  -- Audit log
  INSERT INTO audit_logs (
    actor_type, actor_id, action_type, entity_type, entity_id,
    before_state, after_state, metadata
  ) VALUES (
    v_actor_type, v_actor, 'REDEMPTION_REFUNDED', 'redemption', p_redemption_id::text,
    jsonb_build_object('status', v_redemption.fulfillment_status, 'tokens_spent', v_redemption.tokens_spent),
    jsonb_build_object('status', 'cancelled'),
    jsonb_build_object('reason', p_reason)
  );

  RETURN QUERY SELECT true, v_redemption.tokens_spent, 'cancelled'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_redemption(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.refund_redemption(uuid, text) TO authenticated, service_role;
