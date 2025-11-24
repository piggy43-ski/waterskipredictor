-- Update market_type check constraint to include HIGHEST_SCORE
ALTER TABLE public.markets DROP CONSTRAINT IF EXISTS markets_market_type_check;
ALTER TABLE public.markets ADD CONSTRAINT markets_market_type_check 
  CHECK (market_type IN ('WINNER', 'PODIUM', 'HEAD_TO_HEAD', 'OVER_UNDER', 'HIGHEST_SCORE'));