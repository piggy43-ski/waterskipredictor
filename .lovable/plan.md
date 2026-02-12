

# Fix: Correct settlement_metadata for BETA TESTING Tournament

## Problem

While the `predictions.status` column was correctly updated (Ross Charlie WINNER predictions flipped to LOST, Nate Smith predictions to WON), the `settlement_metadata` JSONB column was never updated. This means the UI still displays:

- "Correct! Ross Charlie finished 1st in Open Men Slalom" (wrong -- should reference Nate Smith)
- `position_1st: "Ross Charlie"` in actual results (should be `"Smith Nate"`)
- Explanations for other athletes say "Winner was Ross Charlie" (should say "Winner was Smith Nate")

**34 predictions** are affected.

## Fix: SQL Migration to Patch settlement_metadata

A single migration will update the `settlement_metadata` JSONB for all 34 affected predictions:

1. **Swap position_1st**: `"Ross Charlie"` becomes `"Smith Nate"` and `position_2nd`: `"Smith Nate"` becomes `"Ross Charlie"`
2. **Fix explanations** for Ross Charlie WINNER predictions (now LOST): Change from "Correct! Ross Charlie finished 1st..." to "Not correct. Ross Charlie did not finish 1st. Winner was Smith Nate."
3. **Fix explanations** for other LOST WINNER predictions: Replace "Winner was Ross Charlie" with "Winner was Smith Nate"
4. **Fix metadata status**: Change `settlement_metadata.status` from `"WON"` to `"LOST"` for the 9 Ross Charlie WINNER predictions
5. **Fix payout_details**: Zero out the payout info in metadata for the flipped predictions
6. **Keep highest_scorer as-is** for HIGHEST_SCORE market: Both scored 1@43, but Nate Smith predictions are already correctly WON there

## Technical Details

The migration uses `jsonb_set()` to surgically update nested JSON fields without replacing the entire object. Multiple passes handle the different explanation patterns.

## Files

| File | Change |
|------|--------|
| Database (migration) | Patch settlement_metadata JSON for 34 predictions |

No code file changes needed -- once the data is corrected, the UI will automatically display the right information.

