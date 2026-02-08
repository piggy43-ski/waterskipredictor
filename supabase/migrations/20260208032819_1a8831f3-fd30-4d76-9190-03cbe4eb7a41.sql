-- Fix: Recreate market_odds_audit_v view with security_invoker to prevent RLS bypass
DROP VIEW IF EXISTS public.market_odds_audit_v;

CREATE VIEW public.market_odds_audit_v 
WITH (security_invoker = true)
AS
SELECT 
  mo.market_id, 
  mo.id as odds_id, 
  mo.athlete_id,
  a.name as athlete_name, 
  mo.athlete_rank as field_rank,
  mo.strength_score, 
  mo.normalized_probability as probability,
  mo.final_decimal_odds as multiplier,
  1.0 / NULLIF(mo.final_decimal_odds, 0) as implied_contrib,
  mo.temperature_used, 
  mo.calibration_iterations,
  mo.clipped_count, 
  mo.dynamic_max_used,
  mo.model_version, 
  mo.generated_at,
  m.market_type, 
  m.discipline, 
  m.category,
  m.name as market_name
FROM public.market_odds mo
JOIN public.athletes a ON a.id = mo.athlete_id
JOIN public.markets m ON m.id = mo.market_id
ORDER BY mo.market_id, mo.athlete_rank;

-- Grant appropriate permissions
GRANT SELECT ON public.market_odds_audit_v TO authenticated;