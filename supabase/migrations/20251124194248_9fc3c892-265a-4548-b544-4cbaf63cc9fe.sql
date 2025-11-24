-- Create function to increment earned tokens in user wallet
CREATE OR REPLACE FUNCTION public.increment_earned_tokens(user_id_param uuid, amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.token_wallets
  SET earned_tokens = earned_tokens + amount,
      updated_at = now()
  WHERE user_id = user_id_param;
END;
$$;