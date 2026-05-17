
ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS fulfillment_overhead_usd NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS redemption_frequency_weight NUMERIC(5,2);

COMMENT ON COLUMN public.rewards.usd_cost IS
  'Wholesale fulfillment cost per redemption in USD (what the house pays).';
COMMENT ON COLUMN public.rewards.fulfillment_overhead_usd IS
  'Estimated per-redemption overhead in USD (shipping, processing, time cost).';
COMMENT ON COLUMN public.rewards.redemption_frequency_weight IS
  'Relative weight (0-100) of this reward in the redemption mix. Used for weighted avg cost-per-token.';
