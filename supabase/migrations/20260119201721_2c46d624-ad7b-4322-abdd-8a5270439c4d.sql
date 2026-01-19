-- Add probability tracking columns to market_odds
ALTER TABLE market_odds ADD COLUMN IF NOT EXISTS raw_probability NUMERIC;
ALTER TABLE market_odds ADD COLUMN IF NOT EXISTS normalized_probability NUMERIC;
ALTER TABLE market_odds ADD COLUMN IF NOT EXISTS adjusted_probability NUMERIC;
ALTER TABLE market_odds ADD COLUMN IF NOT EXISTS sims_run INTEGER DEFAULT 0;

-- Add validation status columns to markets
ALTER TABLE markets ADD COLUMN IF NOT EXISTS odds_validation_status TEXT DEFAULT 'PENDING';
ALTER TABLE markets ADD COLUMN IF NOT EXISTS odds_validation_error TEXT;

-- Add index for validation status queries
CREATE INDEX IF NOT EXISTS idx_markets_odds_validation_status ON markets(odds_validation_status);

-- Add comment for documentation
COMMENT ON COLUMN market_odds.raw_probability IS 'Direct Monte Carlo probability. WINNER/HIGHEST sums to ~1.0, PODIUM sums to ~3.0';
COMMENT ON COLUMN market_odds.normalized_probability IS 'Normalized probability (raw/sum). Always sums to 1.0';
COMMENT ON COLUMN market_odds.adjusted_probability IS 'After house edge. Sums to target implied sum (0.84-0.91)';
COMMENT ON COLUMN market_odds.sims_run IS 'Number of Monte Carlo simulations run. Must be 20000';
COMMENT ON COLUMN markets.odds_validation_status IS 'PENDING, VALID, INVALID, or MISSING';
COMMENT ON COLUMN markets.odds_validation_error IS 'Error message if validation failed';