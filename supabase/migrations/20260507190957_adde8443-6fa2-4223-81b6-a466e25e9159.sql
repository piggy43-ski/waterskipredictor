ALTER TABLE public.token_transactions
ADD COLUMN IF NOT EXISTS affects_wallet boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.token_transactions.affects_wallet IS
  'true = this row corresponds to a real wallet UPDATE; false = audit/marker row only. Wallet reconciliation should sum amounts WHERE affects_wallet = true.';

UPDATE public.token_transactions
SET affects_wallet = false
WHERE type IN ('prediction_lost', 'bet_lost');

CREATE OR REPLACE VIEW public.v_wallet_ledger
WITH (security_invoker = true) AS
SELECT *
FROM public.token_transactions
WHERE affects_wallet = true;

COMMENT ON VIEW public.v_wallet_ledger IS
  'Wallet-affecting transactions only. Sum of amount per user_id reconciles to (token_wallets.purchased_tokens + earned_tokens) modulo any out-of-band credits like Stripe purchases that bypass the ledger.';