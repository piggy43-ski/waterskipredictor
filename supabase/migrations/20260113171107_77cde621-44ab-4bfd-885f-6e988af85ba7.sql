-- Create market_entries table (who is in each contest)
CREATE TABLE public.market_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(market_id, athlete_id)
);

-- Enable RLS
ALTER TABLE public.market_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for market_entries
CREATE POLICY "Market entries are viewable by everyone"
ON public.market_entries FOR SELECT
USING (true);

CREATE POLICY "Admins can insert market entries"
ON public.market_entries FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update market entries"
ON public.market_entries FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete market entries"
ON public.market_entries FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create market_odds table (store multipliers + audit)
CREATE TABLE public.market_odds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  base_probability numeric NOT NULL,
  base_decimal_odds numeric NOT NULL,
  manual_multiplier numeric DEFAULT 0.97,
  final_decimal_odds numeric NOT NULL,
  token_price numeric,
  overround numeric,
  tau numeric,
  sims integer,
  generated_at timestamptz DEFAULT now(),
  is_frozen boolean DEFAULT false,
  UNIQUE(market_id, athlete_id),
  CONSTRAINT manual_multiplier_range CHECK (manual_multiplier >= 0.90 AND manual_multiplier <= 1.10)
);

-- Enable RLS
ALTER TABLE public.market_odds ENABLE ROW LEVEL SECURITY;

-- RLS Policies for market_odds
CREATE POLICY "Market odds are viewable by everyone"
ON public.market_odds FOR SELECT
USING (true);

CREATE POLICY "Admins can insert market odds"
ON public.market_odds FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update market odds"
ON public.market_odds FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete market odds"
ON public.market_odds FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create rating_history table (audit log for Elo changes)
CREATE TABLE public.rating_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid REFERENCES public.tournaments(id),
  market_id uuid REFERENCES public.markets(id),
  athlete_id uuid NOT NULL REFERENCES public.athletes(id),
  discipline text NOT NULL,
  category text NOT NULL,
  old_rating numeric NOT NULL,
  delta numeric NOT NULL,
  new_rating numeric NOT NULL,
  k_factor numeric,
  actual_score numeric,
  expected_score numeric,
  is_major boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rating_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for rating_history
CREATE POLICY "Rating history is viewable by everyone"
ON public.rating_history FOR SELECT
USING (true);

CREATE POLICY "Admins can insert rating history"
ON public.rating_history FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update rating history"
ON public.rating_history FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete rating history"
ON public.rating_history FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create market_results table (final results only)
CREATE TABLE public.market_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES public.athletes(id),
  final_rank integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(market_id, athlete_id)
);

-- Enable RLS
ALTER TABLE public.market_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies for market_results
CREATE POLICY "Market results are viewable by everyone"
ON public.market_results FOR SELECT
USING (true);

CREATE POLICY "Admins can insert market results"
ON public.market_results FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update market results"
ON public.market_results FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete market results"
ON public.market_results FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add indexes for performance
CREATE INDEX idx_market_entries_market_id ON public.market_entries(market_id);
CREATE INDEX idx_market_entries_athlete_id ON public.market_entries(athlete_id);
CREATE INDEX idx_market_odds_market_id ON public.market_odds(market_id);
CREATE INDEX idx_market_odds_athlete_id ON public.market_odds(athlete_id);
CREATE INDEX idx_rating_history_athlete_id ON public.rating_history(athlete_id);
CREATE INDEX idx_rating_history_tournament_id ON public.rating_history(tournament_id);
CREATE INDEX idx_market_results_market_id ON public.market_results(market_id);