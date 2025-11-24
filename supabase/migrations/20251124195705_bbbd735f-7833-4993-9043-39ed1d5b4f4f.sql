-- Add lifetime stats columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS lifetime_deposited INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS lifetime_winnings INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS lifetime_losses INTEGER DEFAULT 0;

-- Create function to auto-assign admin role to first user
CREATE OR REPLACE FUNCTION public.ensure_first_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INTEGER;
BEGIN
  -- Check if this is the first user
  SELECT COUNT(*) INTO user_count FROM auth.users;
  
  IF user_count = 1 THEN
    -- Assign admin role to the first user
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to run after user creation
DROP TRIGGER IF EXISTS on_first_user_admin ON auth.users;
CREATE TRIGGER on_first_user_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_first_admin();