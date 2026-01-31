
-- Fix security definer view issue by explicitly setting SECURITY INVOKER
-- This ensures the view uses the calling user's permissions (safer)
DROP VIEW IF EXISTS public.house_bankroll_summary;

CREATE VIEW public.house_bankroll_summary 
WITH (security_invoker = true)
AS
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
  (l.gross_deposits_usd * c.reserve_pct) AS reserve_usd,
  (l.gross_deposits_usd - l.refunds_usd - l.fees_usd) AS net_deposits_usd,
  GREATEST(0, 
    c.base_bankroll_usd 
    + l.gross_deposits_usd 
    - (l.gross_deposits_usd * c.reserve_pct) 
    - l.refunds_usd 
    - l.fees_usd 
    - l.withdrawals_usd
  ) AS available_bankroll_usd,
  e.total_handle_tokens,
  e.total_liability_tokens,
  e.max_single_liability_tokens,
  (e.total_handle_tokens * c.token_value_usd) AS total_handle_usd,
  (e.total_liability_tokens * c.token_value_usd) AS total_liability_usd,
  (e.max_single_liability_tokens * c.token_value_usd) AS max_single_liability_usd,
  GREATEST(0, (e.max_single_liability_tokens - e.total_handle_tokens) * c.token_value_usd) AS worst_case_loss_usd,
  CASE 
    WHEN GREATEST(0, (e.max_single_liability_tokens - e.total_handle_tokens) * c.token_value_usd) 
         <= GREATEST(0, c.base_bankroll_usd + l.gross_deposits_usd - (l.gross_deposits_usd * c.reserve_pct) - l.refunds_usd - l.fees_usd - l.withdrawals_usd)
    THEN 'SAFE'
    ELSE 'BLOCKED'
  END AS solvency_status
FROM config c
CROSS JOIN ledger_totals l
CROSS JOIN market_exposure e;

-- Re-grant access
GRANT SELECT ON public.house_bankroll_summary TO authenticated;
