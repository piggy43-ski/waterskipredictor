-- Add admin SELECT policy for token_wallets so admins can view all wallets
CREATE POLICY "Admins can view all wallets"
ON public.token_wallets
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));