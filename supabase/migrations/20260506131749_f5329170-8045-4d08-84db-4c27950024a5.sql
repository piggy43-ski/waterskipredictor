INSERT INTO shadow_settlements (shadow_run_id, tournament_id, bet_slip_id, user_id, actual_status, actual_payout_tokens, shadow_status, shadow_payout_tokens, delta_tokens, notes)
SELECT '22222222-3333-4444-5555-666666666666'::uuid,
       tournament_id, bet_slip_id, user_id,
       actual_status, actual_payout_tokens, shadow_status, shadow_payout_tokens, delta_tokens,
       'Re-run with PARLAY_CAPS[5]=60 and MAX_PODIUM_COMBINED=25. Both new caps non-binding for this dataset (max parlay raw*haircut <=27x; max podium actual=13x). Delta identical to a6bf1421 run.'
FROM shadow_settlements
WHERE shadow_run_id = 'a6bf1421-3d0d-4f05-aba9-5a92bdd1e06c';