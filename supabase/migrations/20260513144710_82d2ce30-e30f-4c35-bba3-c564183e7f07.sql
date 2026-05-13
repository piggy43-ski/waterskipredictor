DO $$
DECLARE
  v_red uuid := 'c66c813a-b53f-4776-a3d7-ef6d568964cd';
  v_user uuid := 'b9920bcb-b9b3-497b-84c6-14afa9d9c02b';
  v_reward uuid := '7b7fe99f-e080-4921-8670-9e52386ac116';
  v_tokens int := 5000;
  v_reason text := 'Real-send verification test';
  v_balance int;
BEGIN
  UPDATE public.token_wallets
  SET earned_tokens = earned_tokens + v_tokens, updated_at = now()
  WHERE user_id = v_user
  RETURNING (earned_tokens + purchased_tokens) INTO v_balance;

  UPDATE public.redemptions
  SET fulfillment_status = 'cancelled',
      cancellation_reason = v_reason,
      cancelled_at = now(),
      updated_at = now()
  WHERE id = v_red;

  UPDATE public.house_rewards_liability
  SET status = 'cancelled',
      notes = COALESCE(notes||E'\n','') || 'Refunded: ' || v_reason,
      updated_at = now()
  WHERE redemption_id = v_red;

  INSERT INTO public.token_transactions (
    user_id, type, amount, balance_after, reference_type, reference_id, description,
    transaction_status, source_type, source_id, counterparty, metadata, affects_wallet
  ) VALUES (
    v_user, 'redemption_refund', v_tokens, v_balance, 'redemption', v_red,
    'Refund for cancelled redemption: ' || v_reason,
    'completed', 'reward', v_reward, 'house',
    jsonb_build_object('reason', v_reason, 'manual_refund_post_fulfilled', true),
    true
  );

  INSERT INTO public.audit_logs (
    actor_type, actor_id, action_type, entity_type, entity_id,
    before_state, after_state, metadata
  ) VALUES (
    'system', NULL, 'REDEMPTION_REFUNDED', 'redemption', v_red::text,
    jsonb_build_object('status','fulfilled','tokens_spent',v_tokens),
    jsonb_build_object('status','cancelled'),
    jsonb_build_object('reason', v_reason, 'manual_refund_post_fulfilled', true)
  );
END $$;