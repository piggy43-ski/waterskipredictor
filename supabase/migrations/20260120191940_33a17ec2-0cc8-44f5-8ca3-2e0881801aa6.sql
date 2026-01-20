-- Add rank/rating columns to tournament_entries for caching at entry time
ALTER TABLE public.tournament_entries 
ADD COLUMN IF NOT EXISTS discipline_rank INTEGER,
ADD COLUMN IF NOT EXISTS rating_0_100 NUMERIC,
ADD COLUMN IF NOT EXISTS seed_rank INTEGER;

-- Add comment documentation
COMMENT ON COLUMN public.tournament_entries.discipline_rank IS 'World rank for this discipline at entry time';
COMMENT ON COLUMN public.tournament_entries.rating_0_100 IS 'Athlete rating (0-100) for this discipline at entry time';
COMMENT ON COLUMN public.tournament_entries.seed_rank IS 'Derived seed rank when world rank is missing (based on rating position in field)';

-- Create validation trigger to ensure rating is never null
CREATE OR REPLACE FUNCTION public.validate_tournament_entry_rank_rating()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure rating is populated (default to 70 if missing)
  IF NEW.rating_0_100 IS NULL THEN
    NEW.rating_0_100 := 70;
  END IF;
  
  -- If no discipline_rank and no seed_rank, auto-assign seed_rank based on entry order
  IF NEW.discipline_rank IS NULL AND NEW.seed_rank IS NULL THEN
    NEW.seed_rank := COALESCE(
      (SELECT MAX(COALESCE(seed_rank, 0)) + 1 
       FROM tournament_entries 
       WHERE tournament_id = NEW.tournament_id 
         AND discipline = NEW.discipline),
      1
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS ensure_entry_ranking ON public.tournament_entries;

-- Create trigger
CREATE TRIGGER ensure_entry_ranking
BEFORE INSERT OR UPDATE ON public.tournament_entries
FOR EACH ROW EXECUTE FUNCTION public.validate_tournament_entry_rank_rating();

-- Backfill existing entries with athlete data
UPDATE public.tournament_entries te
SET 
  discipline_rank = CASE te.discipline
    WHEN 'slalom' THEN a.current_rank_slalom
    WHEN 'trick' THEN a.current_rank_trick
    WHEN 'jump' THEN a.current_rank_jump
  END,
  rating_0_100 = COALESCE(
    CASE te.discipline
      WHEN 'slalom' THEN a.current_rating_slalom
      WHEN 'trick' THEN a.current_rating_trick
      WHEN 'jump' THEN a.current_rating_jump
    END,
    70
  )
FROM public.athletes a
WHERE te.athlete_id = a.id
  AND te.rating_0_100 IS NULL;

-- Assign seed_rank for entries still missing discipline_rank (sorted by rating DESC)
WITH ranked_entries AS (
  SELECT 
    te.id,
    ROW_NUMBER() OVER (
      PARTITION BY te.tournament_id, te.discipline 
      ORDER BY COALESCE(te.rating_0_100, 70) DESC NULLS LAST
    ) AS computed_seed
  FROM public.tournament_entries te
  WHERE te.discipline_rank IS NULL
    AND te.seed_rank IS NULL
)
UPDATE public.tournament_entries te
SET seed_rank = re.computed_seed
FROM ranked_entries re
WHERE te.id = re.id;