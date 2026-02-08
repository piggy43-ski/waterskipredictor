-- Allow admins to view all predictions
CREATE POLICY "Admins can view all predictions"
  ON public.predictions
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));