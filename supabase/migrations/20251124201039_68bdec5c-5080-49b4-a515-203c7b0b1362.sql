-- Extend athletes table with ranking and performance fields
ALTER TABLE public.athletes
ADD COLUMN IF NOT EXISTS iwwf_athlete_id text,
ADD COLUMN IF NOT EXISTS full_name text,
ADD COLUMN IF NOT EXISTS country_code text,
ADD COLUMN IF NOT EXISTS profile_image_url text,
ADD COLUMN IF NOT EXISTS bio text,
ADD COLUMN IF NOT EXISTS current_rank_slalom integer,
ADD COLUMN IF NOT EXISTS current_rank_trick integer,
ADD COLUMN IF NOT EXISTS current_rank_jump integer,
ADD COLUMN IF NOT EXISTS current_points_slalom numeric(10,2),
ADD COLUMN IF NOT EXISTS current_points_trick numeric(10,2),
ADD COLUMN IF NOT EXISTS current_points_jump numeric(10,2),
ADD COLUMN IF NOT EXISTS performance_index_slalom numeric(5,3) DEFAULT 0,
ADD COLUMN IF NOT EXISTS performance_index_trick numeric(5,3) DEFAULT 0,
ADD COLUMN IF NOT EXISTS performance_index_jump numeric(5,3) DEFAULT 0,
ADD COLUMN IF NOT EXISTS fantasy_price_slalom integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS fantasy_price_trick integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS fantasy_price_jump integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS popularity_index numeric(5,3) DEFAULT 0,
ADD COLUMN IF NOT EXISTS injury_flag boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS manual_boost_factor numeric(5,2) DEFAULT 1.0;

-- Update full_name from name if not set
UPDATE public.athletes SET full_name = name WHERE full_name IS NULL;
UPDATE public.athletes SET country_code = country WHERE country_code IS NULL;

-- Create athlete_rankings table for IWWF snapshots
CREATE TABLE IF NOT EXISTS public.athlete_rankings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  discipline text NOT NULL CHECK (discipline IN ('slalom', 'trick', 'jump')),
  gender text NOT NULL CHECK (gender IN ('male', 'female')),
  rank integer NOT NULL,
  points numeric(10,2) NOT NULL,
  list_date date NOT NULL DEFAULT CURRENT_DATE,
  source text DEFAULT 'IWWF_EMS',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(athlete_id, discipline, gender, list_date)
);

-- Enable RLS
ALTER TABLE public.athlete_rankings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for athlete_rankings
CREATE POLICY "Rankings are viewable by everyone"
ON public.athlete_rankings FOR SELECT USING (true);

CREATE POLICY "Admins can insert rankings"
ON public.athlete_rankings FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update rankings"
ON public.athlete_rankings FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete rankings"
ON public.athlete_rankings FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create athlete_results table for tournament placements
CREATE TABLE IF NOT EXISTS public.athlete_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  discipline text NOT NULL CHECK (discipline IN ('slalom', 'trick', 'jump')),
  gender text NOT NULL CHECK (gender IN ('male', 'female')),
  position integer,
  made_finals boolean DEFAULT false,
  missed_first_pass boolean DEFAULT false,
  missed_gate boolean DEFAULT false,
  score_raw numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.athlete_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies for athlete_results
CREATE POLICY "Results are viewable by everyone"
ON public.athlete_results FOR SELECT USING (true);

CREATE POLICY "Admins can insert results"
ON public.athlete_results FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update results"
ON public.athlete_results FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete results"
ON public.athlete_results FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_athlete_rankings_athlete_discipline ON public.athlete_rankings(athlete_id, discipline);
CREATE INDEX IF NOT EXISTS idx_athlete_rankings_list_date ON public.athlete_rankings(list_date DESC);
CREATE INDEX IF NOT EXISTS idx_athlete_results_athlete_tournament ON public.athlete_results(athlete_id, tournament_id);
CREATE INDEX IF NOT EXISTS idx_athlete_results_created_at ON public.athlete_results(created_at DESC);

-- Add trigger for athlete_results updated_at
CREATE TRIGGER update_athlete_results_updated_at
BEFORE UPDATE ON public.athlete_results
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();