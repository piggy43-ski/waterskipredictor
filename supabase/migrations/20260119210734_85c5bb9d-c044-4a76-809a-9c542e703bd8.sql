-- Add Option A risk config values
INSERT INTO risk_config (key, value, description) VALUES
  ('fixed_multiplier_mode', 'true', 'Option A: Multipliers locked at publish, no live adjustments'),
  ('max_athlete_exposure_pct', '0.30', 'Maximum % of market pool on one athlete (30%)'),
  ('publish_safety_margin', '0.95', 'Max payout must be ≤ this % of max pool for pre-publish safety'),
  ('allow_live_odds_adjustment', 'false', 'Whether to allow odds shortening during OPEN markets')
ON CONFLICT (key) DO UPDATE SET 
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = NOW();