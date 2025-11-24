-- Add parlay support to predictions table
ALTER TABLE public.predictions 
ADD COLUMN IF NOT EXISTS parlay_id uuid REFERENCES public.predictions(id),
ADD COLUMN IF NOT EXISTS is_parlay_parent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS parlay_leg_count integer DEFAULT 1;

-- Create index for parlay queries
CREATE INDEX IF NOT EXISTS idx_predictions_parlay_id ON public.predictions(parlay_id);

-- Add comment
COMMENT ON COLUMN public.predictions.parlay_id IS 'References parent prediction if this is part of a parlay';
COMMENT ON COLUMN public.predictions.is_parlay_parent IS 'True if this prediction is the parent of a parlay';
COMMENT ON COLUMN public.predictions.parlay_leg_count IS 'Number of legs in the parlay (1 for single bets)';

-- Add podium selection tracking
CREATE TABLE IF NOT EXISTS public.podium_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id uuid NOT NULL REFERENCES public.predictions(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES public.athletes(id),
  position_predicted integer NOT NULL CHECK (position_predicted >= 1 AND position_predicted <= 3),
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(prediction_id, position_predicted)
);

-- Enable RLS on podium_selections
ALTER TABLE public.podium_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own podium selections"
ON public.podium_selections FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.predictions 
  WHERE predictions.id = podium_selections.prediction_id 
  AND predictions.user_id = auth.uid()
));

CREATE POLICY "Users can insert their own podium selections"
ON public.podium_selections FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.predictions 
  WHERE predictions.id = podium_selections.prediction_id 
  AND predictions.user_id = auth.uid()
));

-- Create index for podium selections
CREATE INDEX IF NOT EXISTS idx_podium_selections_prediction_id ON public.podium_selections(prediction_id);
CREATE INDEX IF NOT EXISTS idx_podium_selections_athlete_id ON public.podium_selections(athlete_id);