-- Update handle_new_user to NOT give tokens
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Create profile for new user
  INSERT INTO public.profiles (id, email, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  );
  
  -- Create token wallet with ZERO tokens (users must purchase)
  INSERT INTO public.token_wallets (user_id, earned_tokens, purchased_tokens)
  VALUES (NEW.id, 0, 0);
  
  -- No welcome bonus transaction - users start at 0
  
  RETURN NEW;
END;
$$;