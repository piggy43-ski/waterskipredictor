-- Drop the broken policy with infinite recursion
DROP POLICY IF EXISTS "Fantasy pots viewable by authorized users" ON fantasy_pots;

-- Create corrected policy with proper table references
CREATE POLICY "Fantasy pots viewable by authorized users"
  ON fantasy_pots
  FOR SELECT
  USING (
    (visibility = 'public'::text) OR 
    (created_by = auth.uid()) OR 
    has_role(auth.uid(), 'admin'::app_role) OR 
    (EXISTS (
      SELECT 1 FROM fantasy_invites fi
      WHERE fi.pot_id = fantasy_pots.id 
        AND fi.invited_user_id = auth.uid() 
        AND fi.status = 'accepted'::text
    )) OR 
    (EXISTS (
      SELECT 1 FROM fantasy_entries fe
      WHERE fe.pot_id = fantasy_pots.id 
        AND fe.user_id = auth.uid()
    ))
  );