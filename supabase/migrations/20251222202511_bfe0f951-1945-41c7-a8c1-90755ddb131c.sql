-- Phase 1: Fix Fantasy Duplicate Scoring and Enhance Transaction Ledger

-- Step 1: Clean up existing duplicate scoring events
-- Keep only the most recent scoring event per unique key
DELETE FROM fantasy_scoring_events a
USING fantasy_scoring_events b
WHERE a.created_at < b.created_at
  AND a.entry_id = b.entry_id 
  AND a.athlete_id = b.athlete_id 
  AND a.tournament_id = b.tournament_id
  AND a.discipline = b.discipline;

-- Step 2: Add unique constraint to prevent future duplicates
ALTER TABLE fantasy_scoring_events 
ADD CONSTRAINT unique_scoring_event 
UNIQUE (entry_id, athlete_id, tournament_id, discipline);

-- Step 3: Add missing columns to token_transactions for enhanced ledger
ALTER TABLE token_transactions 
ADD COLUMN IF NOT EXISTS tournament_id uuid REFERENCES tournaments(id),
ADD COLUMN IF NOT EXISTS fantasy_entry_id uuid REFERENCES fantasy_entries(id),
ADD COLUMN IF NOT EXISTS settlement_batch_id uuid;

-- Step 4: Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_token_transactions_tournament 
ON token_transactions(tournament_id);

CREATE INDEX IF NOT EXISTS idx_token_transactions_settlement_batch 
ON token_transactions(settlement_batch_id);

CREATE INDEX IF NOT EXISTS idx_token_transactions_type 
ON token_transactions(type);

CREATE INDEX IF NOT EXISTS idx_fantasy_scoring_events_tournament 
ON fantasy_scoring_events(tournament_id);

-- Step 5: Recalculate fantasy_entries.total_points from deduped scoring events
UPDATE fantasy_entries fe
SET total_points = COALESCE(
  (SELECT SUM(fse.points_awarded) 
   FROM fantasy_scoring_events fse 
   WHERE fse.entry_id = fe.id),
  0
);