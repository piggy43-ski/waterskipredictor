
-- ============================================================
-- Fix settlement_metadata for BETA TESTING slalom open_men
-- Swap position_1st/2nd and fix explanations
-- ============================================================

-- 1. All WINNER predictions: swap position_1st and position_2nd in actual_results
UPDATE predictions
SET settlement_metadata = jsonb_set(
  jsonb_set(
    settlement_metadata,
    '{actual_results,position_1st}', '"Smith Nate"'
  ),
  '{actual_results,position_2nd}', '"Ross Charlie"'
)
WHERE tournament_name = 'BETA TESTING'
  AND discipline = 'slalom'
  AND category = 'open_men'
  AND market_type = 'WINNER'
  AND settlement_metadata IS NOT NULL
  AND settlement_metadata->'actual_results'->>'position_1st' = 'Ross Charlie';

-- 2. Fix WINNER LOST explanations: "Winner was Ross Charlie" -> "Winner was Smith Nate"
UPDATE predictions
SET settlement_metadata = jsonb_set(
  settlement_metadata,
  '{explanation}',
  to_jsonb(replace(settlement_metadata->>'explanation', 'Winner was Ross Charlie', 'Winner was Smith Nate'))
)
WHERE tournament_name = 'BETA TESTING'
  AND discipline = 'slalom'
  AND category = 'open_men'
  AND market_type = 'WINNER'
  AND status = 'LOST'
  AND settlement_metadata->>'explanation' LIKE '%Winner was Ross Charlie%';

-- 3. Fix Ross Charlie WINNER predictions (status=LOST but metadata says WON)
-- Update explanation, metadata status, and zero payout_details
UPDATE predictions
SET settlement_metadata = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          settlement_metadata,
          '{status}', '"LOST"'
        ),
        '{explanation}', '"Not correct. Ross Charlie did not finish 1st. Winner was Smith Nate."'
      ),
      '{payout_details,payout}', '0'
    ),
    '{payout_details,profit}', '0'
  ),
  '{payout_details,odds_decimal}', '0'
)
WHERE tournament_name = 'BETA TESTING'
  AND discipline = 'slalom'
  AND category = 'open_men'
  AND market_type = 'WINNER'
  AND athlete_name = 'Ross Charlie'
  AND status = 'LOST'
  AND settlement_metadata->>'status' = 'WON';

-- 4. Fix Smith Nate WINNER prediction metadata (should be WON with correct explanation)
UPDATE predictions
SET settlement_metadata = jsonb_set(
  jsonb_set(
    settlement_metadata,
    '{status}', '"WON"'
  ),
  '{explanation}', '"Correct! Smith Nate finished 1st in Open Men Slalom."'
)
WHERE tournament_name = 'BETA TESTING'
  AND discipline = 'slalom'
  AND category = 'open_men'
  AND market_type = 'WINNER'
  AND athlete_name = 'Smith Nate'
  AND status = 'WON'
  AND settlement_metadata IS NOT NULL;

-- 5. Fix PODIUM predictions: swap position_1st/2nd where Ross Charlie is listed as 1st
UPDATE predictions
SET settlement_metadata = jsonb_set(
  jsonb_set(
    settlement_metadata,
    '{actual_results,position_1st}', '"Smith Nate"'
  ),
  '{actual_results,position_2nd}', '"Ross Charlie"'
)
WHERE tournament_name = 'BETA TESTING'
  AND discipline = 'slalom'
  AND category = 'open_men'
  AND market_type = 'PODIUM'
  AND settlement_metadata IS NOT NULL
  AND settlement_metadata->'actual_results'->>'position_1st' = 'Ross Charlie';

-- 6. Fix PODIUM LOST explanations mentioning Ross Charlie as 1st
UPDATE predictions
SET settlement_metadata = jsonb_set(
  settlement_metadata,
  '{explanation}',
  to_jsonb(replace(settlement_metadata->>'explanation', '1) Ross Charlie, 2) Smith Nate', '1) Smith Nate, 2) Ross Charlie'))
)
WHERE tournament_name = 'BETA TESTING'
  AND discipline = 'slalom'
  AND category = 'open_men'
  AND market_type = 'PODIUM'
  AND settlement_metadata->>'explanation' LIKE '%1) Ross Charlie, 2) Smith Nate%';

-- 7. Fix HIGHEST_SCORE: swap highest_scorer from Ross Charlie to Smith Nate
-- (Both tied at 1@43, but Smith Nate is the winner)
UPDATE predictions
SET settlement_metadata = jsonb_set(
  settlement_metadata,
  '{actual_results,highest_scorer}', '"Smith Nate"'
)
WHERE tournament_name = 'BETA TESTING'
  AND discipline = 'slalom'
  AND category = 'open_men'
  AND market_type = 'HIGHEST_SCORE'
  AND settlement_metadata->'actual_results'->>'highest_scorer' = 'Ross Charlie';
