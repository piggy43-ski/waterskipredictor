-- Add settled_at column to tournaments table to track when settlement was completed
ALTER TABLE tournaments ADD COLUMN settled_at timestamp with time zone DEFAULT NULL;

-- Add index for faster queries filtering by settled_at
CREATE INDEX idx_tournaments_settled_at ON tournaments(settled_at) WHERE settled_at IS NOT NULL;