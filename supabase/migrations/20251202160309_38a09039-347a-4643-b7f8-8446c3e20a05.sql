-- Update the handle_new_user function to give new users 10,000 starting tokens
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
  
  -- Create token wallet with 10,000 starting tokens
  INSERT INTO public.token_wallets (user_id, earned_tokens, purchased_tokens)
  VALUES (NEW.id, 10000, 0);
  
  -- Record the welcome bonus transaction
  INSERT INTO public.token_transactions (user_id, type, amount, balance_after, description)
  VALUES (NEW.id, 'bonus', 10000, 10000, 'Welcome bonus - thanks for joining!');
  
  RETURN NEW;
END;
$$;