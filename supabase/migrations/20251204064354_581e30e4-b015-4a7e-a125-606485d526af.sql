-- Create security definer function to check if user has an entry in a pot
CREATE OR REPLACE FUNCTION public.user_has_fantasy_entry(_user_id uuid, _pot_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM fantasy_entries
    WHERE user_id = _user_id AND pot_id = _pot_id
  )
$$;

-- Create security definer function to check if a pot is public
CREATE OR REPLACE FUNCTION public.is_pot_public(_pot_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM fantasy_pots
    WHERE id = _pot_id AND visibility = 'public'
  )
$$;

-- Create security definer function to check if user has accepted invite
CREATE OR REPLACE FUNCTION public.user_has_accepted_invite(_user_id uuid, _pot_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM fantasy_invites
    WHERE pot_id = _pot_id 
      AND invited_user_id = _user_id 
      AND status = 'accepted'
  )
$$;

-- Drop and recreate fantasy_pots SELECT policy using the functions
DROP POLICY IF EXISTS "Fantasy pots viewable by authorized users" ON fantasy_pots;

CREATE POLICY "Fantasy pots viewable by authorized users"
  ON fantasy_pots FOR SELECT USING (
    visibility = 'public' OR 
    created_by = auth.uid() OR 
    has_role(auth.uid(), 'admin'::app_role) OR 
    public.user_has_accepted_invite(auth.uid(), id) OR
    public.user_has_fantasy_entry(auth.uid(), id)
  );

-- Drop and recreate fantasy_entries SELECT policy using the function
DROP POLICY IF EXISTS "Users can view entries in pots they joined or public pots" ON fantasy_entries;

CREATE POLICY "Users can view entries in pots they joined or public pots"
  ON fantasy_entries FOR SELECT USING (
    user_id = auth.uid() OR 
    has_role(auth.uid(), 'admin'::app_role) OR 
    public.is_pot_public(pot_id)
  );