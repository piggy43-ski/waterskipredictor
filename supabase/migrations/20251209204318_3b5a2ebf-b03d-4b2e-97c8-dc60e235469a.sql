-- Add settlement_metadata column to predictions table for storing settlement explanations
ALTER TABLE public.predictions 
ADD COLUMN IF NOT EXISTS settlement_metadata jsonb DEFAULT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN public.predictions.settlement_metadata IS 'Stores settlement explanation including actual results and payout breakdown';