
-- ===========================================
-- GLOBAL BANKROLL INFRASTRUCTURE
-- ===========================================

-- 1. HOUSE_BANKROLL_CONFIG TABLE
-- Stores global house bankroll configuration
CREATE TABLE IF NOT EXISTS public.house_bankroll_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value numeric NOT NULL,
  description text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.house_bankroll_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Admin-only read/write
CREATE POLICY "Admins can read bankroll config"
ON public.house_bankroll_config FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert bankroll config"
ON public.house_bankroll_config FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update bankroll config"
ON public.house_bankroll_config FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete bankroll config"
ON public.house_bankroll_config FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default configuration values
INSERT INTO public.house_bankroll_config (key, value, description) VALUES
  ('base_bankroll_usd', 5000.00, 'Starting house bankroll in USD'),
  ('reserve_pct', 0.25, 'Percentage of deposits held in reserve (25%)'),
  ('token_value_usd', 0.01, 'USD value per token (100 tokens = $1)')
ON CONFLICT (key) DO NOTHING;

-- 2. DEPOSIT_LEDGER TABLE
-- Tracks all deposits, refunds, and fees from Stripe
CREATE TABLE IF NOT EXISTS public.deposit_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id),
  transaction_type text NOT NULL CHECK (transaction_type IN ('deposit', 'refund', 'fee', 'withdrawal')),
  amount_usd numeric NOT NULL,
  tokens_amount integer,
  stripe_payment_intent_id text,
  stripe_session_id text,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.deposit_ledger ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Admin full access, users can see their own
CREATE POLICY "Admins can manage deposit ledger"
ON public.deposit_ledger FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own deposits"
ON public.deposit_ledger FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Service role insert for Stripe webhook
CREATE POLICY "Service role can insert deposits"
ON public.deposit_ledger FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_deposit_ledger_user_id ON public.deposit_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_deposit_ledger_type ON public.deposit_ledger(transaction_type);
CREATE INDEX IF NOT EXISTS idx_deposit_ledger_created ON public.deposit_ledger(created_at DESC);

-- 3. HOUSE_BANKROLL_SUMMARY VIEW
-- Real-time calculation of available bankroll
CREATE OR REPLACE VIEW public.house_bankroll_summary AS
WITH config AS (
  SELECT
    MAX(CASE WHEN key = 'base_bankroll_usd' THEN value END) AS base_bankroll_usd,
    MAX(CASE WHEN key = 'reserve_pct' THEN value END) AS reserve_pct,
    MAX(CASE WHEN key = 'token_value_usd' THEN value END) AS token_value_usd
  FROM public.house_bankroll_config
),
ledger_totals AS (
  SELECT
    COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount_usd ELSE 0 END), 0) AS gross_deposits_usd,
    COALESCE(SUM(CASE WHEN transaction_type = 'refund' THEN amount_usd ELSE 0 END), 0) AS refunds_usd,
    COALESCE(SUM(CASE WHEN transaction_type = 'fee' THEN amount_usd ELSE 0 END), 0) AS fees_usd,
    COALESCE(SUM(CASE WHEN transaction_type = 'withdrawal' THEN amount_usd ELSE 0 END), 0) AS withdrawals_usd,
    MAX(created_at) AS last_synced_at
  FROM public.deposit_ledger
),
market_exposure AS (
  -- Calculate worst-case loss across all open markets
  SELECT
    COALESCE(SUM(liability_if_wins), 0) AS total_liability_tokens,
    COALESCE(MAX(liability_if_wins), 0) AS max_single_liability_tokens,
    COALESCE(SUM(total_stake_tokens), 0) AS total_handle_tokens
  FROM public.market_liability ml
  JOIN public.markets m ON m.id = ml.market_id
  JOIN public.tournaments t ON t.id = m.tournament_id
  WHERE t.status IN ('upcoming', 'live')
)
SELECT
  c.base_bankroll_usd,
  c.reserve_pct,
  c.token_value_usd,
  l.gross_deposits_usd,
  l.refunds_usd,
  l.fees_usd,
  l.withdrawals_usd,
  l.last_synced_at,
  -- Calculate reserve (25% of deposits)
  (l.gross_deposits_usd * c.reserve_pct) AS reserve_usd,
  -- Net deposits after refunds and fees
  (l.gross_deposits_usd - l.refunds_usd - l.fees_usd) AS net_deposits_usd,
  -- Available bankroll (clamped to >= 0)
  GREATEST(0, 
    c.base_bankroll_usd 
    + l.gross_deposits_usd 
    - (l.gross_deposits_usd * c.reserve_pct) 
    - l.refunds_usd 
    - l.fees_usd 
    - l.withdrawals_usd
  ) AS available_bankroll_usd,
  -- Market exposure in tokens
  e.total_handle_tokens,
  e.total_liability_tokens,
  e.max_single_liability_tokens,
  -- Convert to USD
  (e.total_handle_tokens * c.token_value_usd) AS total_handle_usd,
  (e.total_liability_tokens * c.token_value_usd) AS total_liability_usd,
  (e.max_single_liability_tokens * c.token_value_usd) AS max_single_liability_usd,
  -- Worst-case loss = max liability - handle (what house could lose if worst outcome)
  GREATEST(0, (e.max_single_liability_tokens - e.total_handle_tokens) * c.token_value_usd) AS worst_case_loss_usd,
  -- Solvency check: is worst-case loss within available bankroll?
  CASE 
    WHEN GREATEST(0, (e.max_single_liability_tokens - e.total_handle_tokens) * c.token_value_usd) 
         <= GREATEST(0, c.base_bankroll_usd + l.gross_deposits_usd - (l.gross_deposits_usd * c.reserve_pct) - l.refunds_usd - l.fees_usd - l.withdrawals_usd)
    THEN 'SAFE'
    ELSE 'BLOCKED'
  END AS solvency_status
FROM config c
CROSS JOIN ledger_totals l
CROSS JOIN market_exposure e;

-- Grant access to the view (follows same pattern as underlying tables)
GRANT SELECT ON public.house_bankroll_summary TO authenticated;
