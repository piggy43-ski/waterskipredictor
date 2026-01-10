-- Add CHECK constraints to prevent negative token balances
ALTER TABLE public.token_wallets
  ADD CONSTRAINT token_wallets_purchased_tokens_non_negative CHECK (purchased_tokens >= 0),
  ADD CONSTRAINT token_wallets_earned_tokens_non_negative CHECK (earned_tokens >= 0);

-- Create atomic function to deduct tokens (deducts from earned first, then purchased)
CREATE OR REPLACE FUNCTION public.deduct_tokens(
  user_id_param UUID,
  amount_param INTEGER
)
RETURNS TABLE(
  success BOOLEAN,
  new_earned_tokens INTEGER,
  new_purchased_tokens INTEGER,
  new_balance INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_earned_tokens INTEGER;
  v_purchased_tokens INTEGER;
  v_new_earned INTEGER;
  v_new_purchased INTEGER;
  v_deduct_from_earned INTEGER;
  v_deduct_from_purchased INTEGER;
BEGIN
  -- Lock the row for update to prevent race conditions
  SELECT tw.earned_tokens, tw.purchased_tokens
  INTO v_earned_tokens, v_purchased_tokens
  FROM token_wallets tw
  WHERE tw.user_id = user_id_param
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 0, 0;
    RETURN;
  END IF;
  
  -- Check if user has enough total balance
  IF (v_earned_tokens + v_purchased_tokens) < amount_param THEN
    RETURN QUERY SELECT false, v_earned_tokens, v_purchased_tokens, (v_earned_tokens + v_purchased_tokens);
    RETURN;
  END IF;
  
  -- Deduct from earned first, then purchased
  v_deduct_from_earned := LEAST(v_earned_tokens, amount_param);
  v_deduct_from_purchased := amount_param - v_deduct_from_earned;
  
  v_new_earned := v_earned_tokens - v_deduct_from_earned;
  v_new_purchased := v_purchased_tokens - v_deduct_from_purchased;
  
  -- Perform atomic update
  UPDATE token_wallets
  SET 
    earned_tokens = v_new_earned,
    purchased_tokens = v_new_purchased,
    updated_at = now()
  WHERE token_wallets.user_id = user_id_param;
  
  RETURN QUERY SELECT true, v_new_earned, v_new_purchased, (v_new_earned + v_new_purchased);
END;
$$;