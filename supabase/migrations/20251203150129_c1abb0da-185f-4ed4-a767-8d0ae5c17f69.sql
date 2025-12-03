-- Allow admins to insert transactions for any user
CREATE POLICY "Admins can insert transactions for any user"
ON public.token_transactions
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to update any wallet
CREATE POLICY "Admins can update any wallet"
ON public.token_wallets
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to view all wallets
CREATE POLICY "Admins can view all wallets"
ON public.token_wallets
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));