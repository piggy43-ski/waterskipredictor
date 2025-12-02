-- Allow users to update their own predictions
CREATE POLICY "Users can update their own predictions"
ON predictions FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);