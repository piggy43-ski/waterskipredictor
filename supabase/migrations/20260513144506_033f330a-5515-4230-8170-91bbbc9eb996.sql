DO $$
DECLARE
  v_user uuid := 'b9920bcb-b9b3-497b-84c6-14afa9d9c02b';
  v_reward uuid := '7b7fe99f-e080-4921-8670-9e52386ac116';
  v_tokens int := 5000;
  v_redemption uuid;
  v_new_balance int;
BEGIN
  INSERT INTO public.redemptions (
    user_id, reward_id, tokens_spent, status, fulfillment_status,
    glove_size, shipping_name, shipping_address_line1, shipping_address_line2,
    shipping_city, shipping_state, shipping_zip, shipping_phone
  ) VALUES (
    v_user, v_reward, v_tokens, 'pending', 'pending_fulfillment',
    'M', 'Robert Pigozzi', '131 Southern Pecan Cir', '101',
    'Winter Garden', 'FL', '34787', '4072710368'
  ) RETURNING id INTO v_redemption;

  UPDATE public.token_wallets
  SET earned_tokens = earned_tokens - v_tokens, updated_at = now()
  WHERE user_id = v_user
  RETURNING (earned_tokens + purchased_tokens) INTO v_new_balance;

  INSERT INTO public.token_transactions (
    user_id, type, amount, balance_after, source_id, source_type, counterparty,
    transaction_status, description, reference_id, reference_type
  ) VALUES (
    v_user, 'redemption', -v_tokens, v_new_balance, v_reward, 'reward', 'house',
    'completed', 'Redeemed: PIGOSKI GMS Gloves (live-send verification)', v_redemption, 'redemption'
  );

  INSERT INTO public.house_rewards_liability (
    redemption_id, reward_id, user_id, token_cost, fulfillment_type, partner, status
  ) VALUES (
    v_redemption, v_reward, v_user, v_tokens, 'physical', 'PIGOSKI', 'unfulfilled'
  );

  PERFORM public.notify_admins_redemption_new(v_redemption, 'PIGOSKI GMS Gloves', v_tokens);

  RAISE NOTICE 'redemption_id=%', v_redemption;
END $$;