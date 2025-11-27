-- Add datetime fields for precise tournament timing
ALTER TABLE tournaments 
ADD COLUMN start_datetime TIMESTAMP WITH TIME ZONE,
ADD COLUMN end_datetime TIMESTAMP WITH TIME ZONE;

-- Migrate existing date-only data to datetime (set to midnight UTC for existing tournaments)
UPDATE tournaments 
SET start_datetime = start_date::timestamp with time zone
WHERE start_date IS NOT NULL;

UPDATE tournaments 
SET end_datetime = end_date::timestamp with time zone + interval '23 hours 59 minutes'
WHERE end_date IS NOT NULL;

-- Add comment for clarity
COMMENT ON COLUMN tournaments.start_datetime IS 'Tournament start date and time - betting locks at this moment';
COMMENT ON COLUMN tournaments.end_datetime IS 'Tournament end date and time - used to calculate Finished status';

-- Keep old date columns for backward compatibility during transition
COMMENT ON COLUMN tournaments.start_date IS 'Deprecated: Use start_datetime instead';
COMMENT ON COLUMN tournaments.end_date IS 'Deprecated: Use end_datetime instead';