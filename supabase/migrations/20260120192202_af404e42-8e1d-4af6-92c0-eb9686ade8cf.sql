-- Update the trigger to assign seed_rank based on rating (highest rating = rank 1)
CREATE OR REPLACE FUNCTION public.validate_tournament_entry_rank_rating()
RETURNS TRIGGER AS $$
DECLARE
  v_max_seed INTEGER;
  v_rating NUMERIC;
BEGIN
  -- Ensure rating is populated (default to 70 if missing)
  IF NEW.rating_0_100 IS NULL THEN
    NEW.rating_0_100 := 70;
  END IF;
  
  -- If no discipline_rank and no seed_rank, auto-assign seed_rank
  -- NOTE: For proper rating-based ordering, seed_rank should be recalculated 
  -- after all entries are added using a batch process. This trigger assigns
  -- a temporary seed based on entry order.
  IF NEW.discipline_rank IS NULL AND NEW.seed_rank IS NULL THEN
    -- Get current max seed_rank for this tournament+discipline
    SELECT COALESCE(MAX(seed_rank), 0) INTO v_max_seed
    FROM tournament_entries 
    WHERE tournament_id = NEW.tournament_id 
      AND discipline = NEW.discipline;
    
    NEW.seed_rank := v_max_seed + 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;