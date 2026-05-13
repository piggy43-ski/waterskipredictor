ALTER TABLE token_transactions DROP CONSTRAINT IF EXISTS token_transactions_type_check;
ALTER TABLE token_transactions ADD CONSTRAINT token_transactions_type_check
  CHECK (type = ANY (ARRAY['deposit','bet_placed','entry_placed','bet_won','bet_lost','bet_void','prediction_won','prediction_lost','prediction_void','bonus','redemption','redemption_refund','adjustment','burn','bet','win','refund','transfer','reward_redemption','fantasy_entry','fantasy_payout']));

DO $$
DECLARE
  v_user uuid := 'b9920bcb-b9b3-497b-84c6-14afa9d9c02b';
  v_test1_redemption uuid := '4bba4d5e-1ca6-4d57-8afc-b525cbf344ec';
  v_test1_liability uuid := '3828d6cc-bdfb-416d-bd19-432eabae08ed';
  v_giftcard_reward uuid := 'ef449213-1fce-4eb7-baaf-b4050d8e1bc3';
  v_elite_reward uuid := 'c8225e06-d064-44e7-9bd5-757befa0056f';
  v_test2_redemption uuid;
  v_test3_redemption uuid;
  v_balance integer;
BEGIN
  UPDATE redemptions SET fulfillment_status='shipped', tracking_number='1Z999AA1', carrier='UPS', updated_at=now() WHERE id=v_test1_redemption;
  UPDATE house_rewards_liability SET status='shipped', updated_at=now() WHERE id=v_test1_liability;
  UPDATE redemptions SET fulfillment_status='fulfilled', updated_at=now() WHERE id=v_test1_redemption;
  UPDATE house_rewards_liability SET status='delivered', fulfilled_at=now(), updated_at=now() WHERE id=v_test1_liability;

  UPDATE token_wallets SET earned_tokens=earned_tokens-10000, updated_at=now() WHERE user_id=v_user
    RETURNING (earned_tokens+purchased_tokens) INTO v_balance;
  INSERT INTO redemptions (user_id, reward_id, tokens_spent, status, fulfillment_status, gift_card_email)
    VALUES (v_user, v_giftcard_reward, 10000, 'pending', 'pending_fulfillment', 'smoke-test@waterskipredictor.com')
    RETURNING id INTO v_test2_redemption;
  INSERT INTO house_rewards_liability (redemption_id, reward_id, user_id, token_cost, usd_estimated_cost, fulfillment_type, partner, status)
    SELECT v_test2_redemption, id, v_user, required_tokens, usd_cost, COALESCE(fulfillment_type,'digital'), partner, 'unfulfilled'
    FROM rewards WHERE id=v_giftcard_reward;
  INSERT INTO token_transactions (user_id, type, amount, balance_after, source_id, source_type, counterparty, transaction_status, description, reference_id, reference_type)
    VALUES (v_user, 'redemption', -10000, v_balance, v_giftcard_reward, 'reward', 'house', 'completed', 'Redeemed: PIGOSKI Gift Card', v_test2_redemption, 'redemption');
  UPDATE redemptions SET fulfillment_status='fulfilled', shopify_gift_card_id='TEST-CODE-1234', updated_at=now() WHERE id=v_test2_redemption;
  UPDATE house_rewards_liability SET status='delivered', fulfilled_at=now(), updated_at=now() WHERE redemption_id=v_test2_redemption;

  UPDATE token_wallets SET earned_tokens=earned_tokens-200000, updated_at=now() WHERE user_id=v_user
    RETURNING (earned_tokens+purchased_tokens) INTO v_balance;
  INSERT INTO redemptions (user_id, reward_id, tokens_spent, status, fulfillment_status, supplier)
    VALUES (v_user, v_elite_reward, 200000, 'pending', 'concierge_review', 'Goode')
    RETURNING id INTO v_test3_redemption;
  INSERT INTO house_rewards_liability (redemption_id, reward_id, user_id, token_cost, usd_estimated_cost, fulfillment_type, partner, status)
    SELECT v_test3_redemption, id, v_user, required_tokens, usd_cost, COALESCE(fulfillment_type,'digital'), partner, 'unfulfilled'
    FROM rewards WHERE id=v_elite_reward;
  INSERT INTO token_transactions (user_id, type, amount, balance_after, source_id, source_type, counterparty, transaction_status, description, reference_id, reference_type)
    VALUES (v_user, 'redemption', -200000, v_balance, v_elite_reward, 'reward', 'house', 'completed', 'Redeemed: Goode XTR Pro 67', v_test3_redemption, 'redemption');

  PERFORM public.refund_redemption(v_test3_redemption, 'Smoke test cancellation');

  RAISE NOTICE 'TEST2_ID=% TEST3_ID=%', v_test2_redemption, v_test3_redemption;
END $$;