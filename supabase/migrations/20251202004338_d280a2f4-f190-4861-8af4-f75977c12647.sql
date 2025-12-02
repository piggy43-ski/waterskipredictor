-- Allow users to delete their own bet_slips
CREATE POLICY "Users can delete their own bet slips"
ON bet_slips FOR DELETE
USING (auth.uid() = user_id);

-- Allow users to delete their own predictions
CREATE POLICY "Users can delete their own predictions"
ON predictions FOR DELETE
USING (auth.uid() = user_id);

-- Allow users to delete their own podium selections (via prediction ownership)
CREATE POLICY "Users can delete their own podium selections"
ON podium_selections FOR DELETE
USING (EXISTS (
  SELECT 1 FROM predictions
  WHERE predictions.id = podium_selections.prediction_id
  AND predictions.user_id = auth.uid()
));