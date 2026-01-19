-- Add calibration tracking columns to market_odds table
ALTER TABLE market_odds ADD COLUMN IF NOT EXISTS power_score NUMERIC;
ALTER TABLE market_odds ADD COLUMN IF NOT EXISTS prior_probability NUMERIC;
ALTER TABLE market_odds ADD COLUMN IF NOT EXISTS mc_probability NUMERIC;
ALTER TABLE market_odds ADD COLUMN IF NOT EXISTS blended_probability NUMERIC;
ALTER TABLE market_odds ADD COLUMN IF NOT EXISTS temperature_used NUMERIC;
ALTER TABLE market_odds ADD COLUMN IF NOT EXISTS calibration_iterations INTEGER;

-- Add rank column for debugging
ALTER TABLE market_odds ADD COLUMN IF NOT EXISTS athlete_rank INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN market_odds.power_score IS 'Power score = rating + rank bonus (used for prior calculation)';
COMMENT ON COLUMN market_odds.prior_probability IS 'Probability from rank/rating prior only';
COMMENT ON COLUMN market_odds.mc_probability IS 'Probability from Monte Carlo simulation only';
COMMENT ON COLUMN market_odds.blended_probability IS 'Blended probability = alpha*MC + (1-alpha)*prior';
COMMENT ON COLUMN market_odds.temperature_used IS 'Temperature value after auto-calibration';
COMMENT ON COLUMN market_odds.calibration_iterations IS 'Number of calibration iterations to pass constraints';