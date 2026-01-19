-- Delete duplicate selections, keeping the one with the most recent ID
DELETE FROM selections 
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY market_id, athlete_id 
      ORDER BY id DESC
    ) AS rn
    FROM selections
  ) t 
  WHERE rn > 1
);

-- Add unique constraint to prevent future duplicates
ALTER TABLE selections 
ADD CONSTRAINT selections_market_athlete_unique 
UNIQUE (market_id, athlete_id);