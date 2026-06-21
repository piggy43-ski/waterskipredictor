CREATE TABLE IF NOT EXISTS public.token_wallets_backup_bugfix_20260620 AS
SELECT user_id, earned_tokens, purchased_tokens, now() AS backed_up_at
FROM public.token_wallets;

GRANT ALL ON public.token_wallets_backup_bugfix_20260620 TO service_role;
ALTER TABLE public.token_wallets_backup_bugfix_20260620 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view wallet bugfix backup"
  ON public.token_wallets_backup_bugfix_20260620 FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));