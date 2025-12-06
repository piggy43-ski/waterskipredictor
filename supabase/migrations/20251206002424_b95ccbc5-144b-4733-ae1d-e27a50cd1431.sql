-- Add override_rating column to tournament_entries
ALTER TABLE tournament_entries ADD COLUMN IF NOT EXISTS override_rating numeric DEFAULT NULL;

-- Create rating_adjustments table for AI learning
CREATE TABLE IF NOT EXISTS public.rating_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  discipline text NOT NULL,
  
  -- Before values
  rating_before numeric NOT NULL,
  base_strength_before numeric NOT NULL,
  form_boost_before numeric NOT NULL,
  
  -- What was predicted/overridden
  predicted_rating numeric,
  override_rating numeric,
  
  -- Actual result
  actual_position integer,
  made_finals boolean DEFAULT false,
  field_size integer,
  
  -- After values (post-tournament adjustment)
  rating_after numeric NOT NULL,
  adjustment_delta numeric NOT NULL,
  adjustment_reason text,
  
  -- Override accuracy tracking
  override_was_accurate boolean,
  
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rating_adjustments ENABLE ROW LEVEL SECURITY;

-- RLS policies for rating_adjustments
CREATE POLICY "Rating adjustments viewable by everyone"
ON public.rating_adjustments FOR SELECT
USING (true);

CREATE POLICY "Admins can insert rating adjustments"
ON public.rating_adjustments FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update rating adjustments"
ON public.rating_adjustments FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete rating adjustments"
ON public.rating_adjustments FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_rating_adjustments_athlete ON rating_adjustments(athlete_id);
CREATE INDEX IF NOT EXISTS idx_rating_adjustments_tournament ON rating_adjustments(tournament_id);
CREATE INDEX IF NOT EXISTS idx_rating_adjustments_discipline ON rating_adjustments(discipline);