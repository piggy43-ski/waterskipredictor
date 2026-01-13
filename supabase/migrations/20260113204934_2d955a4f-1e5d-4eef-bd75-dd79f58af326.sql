-- Add columns to track normalization details in market_odds
ALTER TABLE market_odds
  ADD COLUMN IF NOT EXISTS target_implied_sum decimal(6,4),
  ADD COLUMN IF NOT EXISTS scaling_factor decimal(6,4) DEFAULT 1.0;