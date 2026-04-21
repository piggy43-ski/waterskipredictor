UPDATE public.predictions
SET payout_tokens = FLOOR(staked_tokens * decimal_odds)::int
WHERE status = 'WON'
  AND payout_tokens = 0
  AND staked_tokens > 0
  AND decimal_odds > 0;