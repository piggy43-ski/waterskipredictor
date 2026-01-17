-- Add locked_at column to markets table for immutable settlement tracking
ALTER TABLE markets ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ DEFAULT NULL;

-- Add index for quick lookups on locked markets
CREATE INDEX IF NOT EXISTS idx_markets_locked_at ON markets(locked_at) WHERE locked_at IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN markets.locked_at IS 'Timestamp when market results were finalized and locked. After this, explanations cannot be changed.';