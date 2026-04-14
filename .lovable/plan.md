

## Fix: Extend Odds Ladder in generate-market-odds Edge Function

### Root Cause
The `ODDS_LADDER` array in `generate-market-odds/index.ts` (line 73-81) stops at **8.00**. The `roundToLadder()` function clamps every value to this max, so all longshot athletes (ranks 6-12) get 8.00x regardless of their true probability (~3-5%). This makes the implied sum balloon to 3.45 instead of the target 0.91.

### Fix
1. **Extend `ODDS_LADDER`** in the edge function to match the ladder in `multiplierUtils.ts` -- add values from 8.50 through 20.00
2. **Re-run odds generation** for both Swiss Pro Trick markets after deploying

### What This Fixes
- Longshots (ranks 6-12) will get proper multipliers like 12x, 15x, 20x instead of all being 8x
- Implied sum will converge to the 0.90-0.92 target band
- House edge will be properly maintained at ~9%

### Files Changed
| File | Change |
|------|--------|
| `supabase/functions/generate-market-odds/index.ts` | Extend ODDS_LADDER array to include values up to 20.00 |

### After Deploy
- Re-invoke `generate-market-odds` for both Swiss Pro men's and women's trick markets
- Verify implied sums land in 0.90-0.92 band

