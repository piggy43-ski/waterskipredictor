
DROP POLICY "Admins can update all bet slips" ON public.bet_slips;
DROP POLICY "Users can cancel their own pending bet slips" ON public.bet_slips;

CREATE POLICY "Admins can update all bet slips"
ON public.bet_slips FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can cancel their own pending bet slips"
ON public.bet_slips FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND status = 'PENDING'::text)
WITH CHECK (auth.uid() = user_id AND status = 'CANCELLED'::text);
