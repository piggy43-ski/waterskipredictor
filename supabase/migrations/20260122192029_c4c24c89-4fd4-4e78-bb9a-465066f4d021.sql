-- Add is_cascaded flag to track automatically cascaded probabilities
ALTER TABLE public.market_probability_overrides 
ADD COLUMN IF NOT EXISTS is_cascaded boolean NOT NULL DEFAULT false;

-- Add comment
COMMENT ON COLUMN public.market_probability_overrides.is_cascaded IS 'True if this probability was auto-cascaded from a WINNER market override';