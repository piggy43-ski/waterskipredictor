-- =============================================
-- FULL MONTE CARLO AUTOMATION TABLES + TRIGGERS
-- =============================================

-- 1. Create odds_generation_jobs table for debounced job processing
CREATE TABLE IF NOT EXISTS public.odds_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  triggered_by TEXT NOT NULL, -- 'athlete_added', 'rating_update', 'schedule', 'manual', 'auto_create'
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for job processor
CREATE INDEX idx_odds_jobs_pending ON odds_generation_jobs(scheduled_for) 
  WHERE status = 'pending';

-- Unique constraint to prevent duplicate pending jobs
CREATE UNIQUE INDEX idx_odds_jobs_one_pending_per_market 
  ON odds_generation_jobs(market_id) 
  WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.odds_generation_jobs ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "Admins can view odds jobs"
  ON public.odds_generation_jobs
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage odds jobs"
  ON public.odds_generation_jobs
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Create parlay_markets table for auto-generated parlays
CREATE TABLE IF NOT EXISTS public.parlay_markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  leg_count INTEGER NOT NULL DEFAULT 2, -- 2 or 3
  legs JSONB NOT NULL, -- Array of { market_id, athlete_id, market_type, multiplier }
  combined_multiplier NUMERIC NOT NULL,
  house_factor NUMERIC NOT NULL DEFAULT 0.85, -- 15% edge minimum
  final_multiplier NUMERIC NOT NULL,
  implied_probability NUMERIC,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_parlay_markets_tournament ON parlay_markets(tournament_id, status);

-- Enable RLS
ALTER TABLE public.parlay_markets ENABLE ROW LEVEL SECURITY;

-- Public can view open parlays
CREATE POLICY "Anyone can view open parlays"
  ON public.parlay_markets
  FOR SELECT
  USING (status = 'OPEN');

-- Admins can manage all parlays
CREATE POLICY "Admins can manage parlays"
  ON public.parlay_markets
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Add model_version and last_run_at to market_odds if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_odds' AND column_name = 'model_version') THEN
    ALTER TABLE public.market_odds ADD COLUMN model_version TEXT DEFAULT 'v1.0';
  END IF;
END $$;

-- 4. Create trigger function to schedule odds on tournament_entries changes
CREATE OR REPLACE FUNCTION public.schedule_odds_on_entry_change()
RETURNS TRIGGER AS $$
DECLARE
  market_record RECORD;
  affected_athlete_id UUID;
  affected_discipline TEXT;
  affected_tournament_id UUID;
  athlete_gender TEXT;
  market_category TEXT;
BEGIN
  -- Get affected values
  affected_athlete_id := COALESCE(NEW.athlete_id, OLD.athlete_id);
  affected_discipline := COALESCE(NEW.discipline, OLD.discipline);
  affected_tournament_id := COALESCE(NEW.tournament_id, OLD.tournament_id);
  
  -- Get athlete gender
  SELECT gender INTO athlete_gender 
  FROM athletes 
  WHERE id = affected_athlete_id;
  
  market_category := CASE WHEN athlete_gender = 'male' THEN 'open_men' ELSE 'open_women' END;
  
  -- Find all markets for this tournament + discipline + category
  FOR market_record IN 
    SELECT m.id 
    FROM markets m
    WHERE m.tournament_id = affected_tournament_id
      AND m.discipline = affected_discipline
      AND m.category = market_category
      AND m.locked_at IS NULL
  LOOP
    -- Insert job with 10 min delay (debounce)
    -- ON CONFLICT DO NOTHING prevents duplicate pending jobs
    INSERT INTO odds_generation_jobs (market_id, triggered_by, scheduled_for)
    VALUES (market_record.id, 'athlete_added', NOW() + INTERVAL '10 minutes')
    ON CONFLICT (market_id) WHERE status = 'pending' DO NOTHING;
  END LOOP;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_schedule_odds_on_entry
AFTER INSERT OR DELETE ON tournament_entries
FOR EACH ROW
EXECUTE FUNCTION schedule_odds_on_entry_change();

-- 5. Create trigger function to schedule odds on athlete rating changes
CREATE OR REPLACE FUNCTION public.schedule_odds_on_rating_change()
RETURNS TRIGGER AS $$
DECLARE
  market_record RECORD;
BEGIN
  -- Only trigger if ratings actually changed
  IF (NEW.current_rating_slalom IS DISTINCT FROM OLD.current_rating_slalom)
     OR (NEW.current_rating_trick IS DISTINCT FROM OLD.current_rating_trick)
     OR (NEW.current_rating_jump IS DISTINCT FROM OLD.current_rating_jump) THEN
    
    -- Find markets where this athlete has selections
    FOR market_record IN 
      SELECT DISTINCT m.id
      FROM markets m
      JOIN selections s ON s.market_id = m.id
      WHERE s.athlete_id = NEW.id
        AND m.locked_at IS NULL
    LOOP
      INSERT INTO odds_generation_jobs (market_id, triggered_by, scheduled_for)
      VALUES (market_record.id, 'rating_update', NOW() + INTERVAL '10 minutes')
      ON CONFLICT (market_id) WHERE status = 'pending' DO NOTHING;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_schedule_odds_on_rating
AFTER UPDATE ON athletes
FOR EACH ROW
EXECUTE FUNCTION schedule_odds_on_rating_change();