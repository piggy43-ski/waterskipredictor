
DROP FUNCTION IF EXISTS public.refund_redemption(uuid, text);

CREATE OR REPLACE FUNCTION public.refund_redemption(
  p_redemption_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_redemption record;
  v_caller uuid := auth.uid();
  v_new_balance integer;
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can issue refunds';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason required (min 3 chars)';
  END IF;

  SELECT * INTO v_redemption FROM public.redemptions WHERE id = p_redemption_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Redemption % not found', p_redemption_id;
  END IF;

  IF v_redemption.fulfillment_status = 'fulfilled' THEN
    RAISE EXCEPTION 'Cannot refund fulfilled redemption. Product delivered. Use manual return flow.';
  END IF;

  IF v_redemption.fulfillment_status = 'cancelled' OR v_redemption.status = 'cancelled' THEN
    RAISE EXCEPTION 'Redemption already cancelled.';
  END IF;

  UPDATE public.token_wallets
  SET earned_tokens = earned_tokens + v_redemption.tokens_spent,
      updated_at = now()
  WHERE user_id = v_redemption.user_id
  RETURNING (earned_tokens + purchased_tokens) INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found for user %', v_redemption.user_id;
  END IF;

  UPDATE public.redemptions
  SET fulfillment_status = 'cancelled', status = 'cancelled',
      cancelled_at = now(), cancellation_reason = p_reason, updated_at = now()
  WHERE id = p_redemption_id;

  UPDATE public.house_rewards_liability
  SET status = 'refunded',
      notes = COALESCE(notes || E'\n', '') || 'Refunded: ' || p_reason,
      updated_at = now()
  WHERE redemption_id = p_redemption_id;

  INSERT INTO public.token_transactions (
    user_id, type, amount, balance_after,
    source_id, source_type, counterparty,
    transaction_status, description,
    reference_id, reference_type, metadata
  ) VALUES (
    v_redemption.user_id, 'redemption_refund', v_redemption.tokens_spent, v_new_balance,
    v_redemption.reward_id, 'reward', 'house',
    'completed', 'Refund: ' || p_reason,
    p_redemption_id, 'reward',
    jsonb_build_object(
      'redemption_id', p_redemption_id,
      'reason', p_reason,
      'refunded_by', v_caller,
      'previous_fulfillment_status', v_redemption.fulfillment_status
    )
  );

  INSERT INTO public.audit_logs (
    actor_type, actor_id, entity_type, entity_id, action_type, metadata
  ) VALUES (
    'admin', v_caller, 'redemption', p_redemption_id::text, 'refund_redemption',
    jsonb_build_object(
      'reason', p_reason,
      'tokens_refunded', v_redemption.tokens_spent,
      'previous_fulfillment_status', v_redemption.fulfillment_status,
      'previous_status', v_redemption.status
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'redemption_id', p_redemption_id,
    'tokens_refunded', v_redemption.tokens_spent,
    'new_balance', v_new_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refund_redemption(uuid, text) TO authenticated;
