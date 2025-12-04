-- Create fantasy_invites table for private league invitations
CREATE TABLE public.fantasy_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pot_id UUID NOT NULL REFERENCES fantasy_pots(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL,
  invited_user_id UUID, -- null if invite is by code only
  invite_code TEXT, -- unique code for link sharing
  status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, declined
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(pot_id, invited_user_id)
);

-- Add scoring_starts_from to fantasy_pots for late-join scoring
ALTER TABLE public.fantasy_pots ADD COLUMN IF NOT EXISTS scoring_starts_from UUID REFERENCES tournaments(id);

-- Enable RLS on fantasy_invites
ALTER TABLE public.fantasy_invites ENABLE ROW LEVEL SECURITY;

-- RLS Policies for fantasy_invites
CREATE POLICY "Users can view invites they sent or received"
ON public.fantasy_invites
FOR SELECT
USING (
  invited_by = auth.uid() 
  OR invited_user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Pot creators can insert invites"
ON public.fantasy_invites
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM fantasy_pots fp 
    WHERE fp.id = pot_id AND fp.created_by = auth.uid()
  )
);

CREATE POLICY "Users can update their own received invites"
ON public.fantasy_invites
FOR UPDATE
USING (invited_user_id = auth.uid() OR invited_by = auth.uid());

CREATE POLICY "Pot creators can delete invites"
ON public.fantasy_invites
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM fantasy_pots fp 
    WHERE fp.id = pot_id AND fp.created_by = auth.uid()
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Update fantasy_pots RLS to allow viewing private pots if user has accepted invite
DROP POLICY IF EXISTS "Fantasy pots are viewable by everyone" ON public.fantasy_pots;

CREATE POLICY "Fantasy pots viewable by public or invited users"
ON public.fantasy_pots
FOR SELECT
USING (
  visibility = 'public'
  OR created_by = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM fantasy_invites fi 
    WHERE fi.pot_id = id 
    AND fi.invited_user_id = auth.uid() 
    AND fi.status = 'accepted'
  )
);

-- Also allow viewing if user already has an entry in the pot
DROP POLICY IF EXISTS "Fantasy pots viewable by public or invited users" ON public.fantasy_pots;

CREATE POLICY "Fantasy pots viewable by authorized users"
ON public.fantasy_pots
FOR SELECT
USING (
  visibility = 'public'
  OR created_by = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM fantasy_invites fi 
    WHERE fi.pot_id = id 
    AND fi.invited_user_id = auth.uid() 
    AND fi.status = 'accepted'
  )
  OR EXISTS (
    SELECT 1 FROM fantasy_entries fe
    WHERE fe.pot_id = id
    AND fe.user_id = auth.uid()
  )
);