-- Clean database - Delete all existing athlete and ranking data
-- This allows starting fresh with proper consolidated athlete records

-- Delete all ranking snapshots first (due to foreign key constraint)
DELETE FROM public.athlete_rankings;

-- Delete all athlete records
DELETE FROM public.athletes;

-- Note: Table schemas remain intact, only data is removed