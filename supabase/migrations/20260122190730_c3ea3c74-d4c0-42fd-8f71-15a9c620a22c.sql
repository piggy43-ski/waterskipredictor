-- Add is_published field to markets table for draft/publish workflow
ALTER TABLE public.markets 
ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;

-- Add markets_published_at timestamp
ALTER TABLE public.markets 
ADD COLUMN IF NOT EXISTS published_at timestamp with time zone;

-- Create index for faster querying of published markets
CREATE INDEX IF NOT EXISTS idx_markets_is_published ON public.markets(is_published) WHERE is_published = true;

-- Add comment for documentation
COMMENT ON COLUMN public.markets.is_published IS 'Markets start in draft mode (false). Only published markets are visible to users for betting.';
COMMENT ON COLUMN public.markets.published_at IS 'Timestamp when market was published for betting.';