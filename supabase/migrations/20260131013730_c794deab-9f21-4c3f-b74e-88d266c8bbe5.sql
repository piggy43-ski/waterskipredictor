-- Fix: fantasy_entry_athletes table has RLS enabled but no policies
-- This breaks all fantasy team functionality

-- First, drop any existing policies (safety measure)
DROP POLICY IF EXISTS "Users can view authorized roster athletes" ON fantasy_entry_athletes;
DROP POLICY IF EXISTS "Users can manage their own roster athletes" ON fantasy_entry_athletes;
DROP POLICY IF EXISTS "Users can view their own roster athletes" ON fantasy_entry_athletes;
DROP POLICY IF EXISTS "Users can add athletes to their own roster" ON fantasy_entry_athletes;
DROP POLICY IF EXISTS "Users can remove athletes from their own roster" ON fantasy_entry_athletes;
DROP POLICY IF EXISTS "Users can update their own roster athletes" ON fantasy_entry_athletes;

-- Create SELECT policy: Users can view their own rosters, admin rosters, or rosters in public pots
CREATE POLICY "Users can view authorized roster athletes"
ON fantasy_entry_athletes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM fantasy_entries fe
    WHERE fe.id = fantasy_entry_athletes.entry_id
    AND (fe.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
  OR
  EXISTS (
    SELECT 1 FROM fantasy_entries fe
    JOIN fantasy_pots fp ON fp.id = fe.pot_id
    WHERE fe.id = fantasy_entry_athletes.entry_id
    AND fp.visibility = 'public'
  )
);

-- Create INSERT policy: Users can add athletes to their own entries
CREATE POLICY "Users can add athletes to their roster"
ON fantasy_entry_athletes FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM fantasy_entries fe
    WHERE fe.id = fantasy_entry_athletes.entry_id
    AND fe.user_id = auth.uid()
  )
);

-- Create UPDATE policy: Users can update their own roster entries
CREATE POLICY "Users can update their roster athletes"
ON fantasy_entry_athletes FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM fantasy_entries fe
    WHERE fe.id = fantasy_entry_athletes.entry_id
    AND fe.user_id = auth.uid()
  )
);

-- Create DELETE policy: Users can remove athletes from their own roster
CREATE POLICY "Users can remove athletes from their roster"
ON fantasy_entry_athletes FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM fantasy_entries fe
    WHERE fe.id = fantasy_entry_athletes.entry_id
    AND fe.user_id = auth.uid()
  )
);

-- Admin full access policy
CREATE POLICY "Admins can manage all roster athletes"
ON fantasy_entry_athletes FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));