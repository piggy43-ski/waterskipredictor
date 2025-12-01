
-- Add unique constraint to prevent duplicate markets
ALTER TABLE markets 
ADD CONSTRAINT unique_market_per_tournament 
UNIQUE (tournament_id, discipline, category, market_type);
