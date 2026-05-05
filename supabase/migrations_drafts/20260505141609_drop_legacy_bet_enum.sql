-- DRAFT: Do not run yet. Scheduled for >= 2026-05-11 after 3-7 day bake period.
-- Drops legacy 'bet_*' values (and unused 'bet') from token_transactions.type CHECK constraint.
--
-- BEFORE APPLYING:
--   1. Re-run grep: zero writers of bet_* outside _archive
--   2. Confirm zero rows: SELECT COUNT(*) FROM token_transactions
--      WHERE type IN ('bet','bet_placed','bet_won','bet_lost','bet_void');
--   3. Re-verify SELECT DISTINCT type FROM token_transactions matches the list below.
--   4. Rename file: remove _DRAFT suffix, then supabase db push.
--
-- The full list below preserves every non-bet_* value present in the current
-- constraint (as of 2026-05-05) so existing rows continue to validate, even
-- those types not currently observed in data.

ALTER TABLE token_transactions DROP CONSTRAINT token_transactions_type_check;

ALTER TABLE token_transactions ADD CONSTRAINT token_transactions_type_check
CHECK (type = ANY (ARRAY[
  'deposit'::text,
  'entry_placed'::text,
  'prediction_won'::text,
  'prediction_lost'::text,
  'prediction_void'::text,
  'bonus'::text,
  'redemption'::text,
  'adjustment'::text,
  'burn'::text,
  'win'::text,
  'refund'::text,
  'transfer'::text,
  'reward_redemption'::text,
  'fantasy_entry'::text,
  'fantasy_payout'::text
]));
