

# Fix: Deleted Athletes Reappearing + Rank Still Misaligned

## Issue 1: Deleted Athletes Reappear (Corey Vaughn, Martin Kolman)

**Root Cause**: `deleteEntryMutation` (line 1011-1026) only deletes from `tournament_entries`. The athlete's rows in `selections`, `market_odds`, `market_probability_overrides`, and `market_multiplier_overrides` remain untouched. The Probability Editor reads from `market_odds`, so deleted athletes keep showing up.

Confirmed: Kolman Martin and Vaughn Corey still have 6 selection rows (WINNER/PODIUM/HIGHEST_SCORE each) in the Moomba Masters markets despite the tournament entry being deleted.

**Fix** in `src/pages/admin/TournamentEntries.tsx`:
- Expand `deleteEntryMutation` to:
  1. Look up the entry's `athlete_id` and `discipline` before deleting
  2. Find all markets for this tournament + discipline + athlete's gender category
  3. Delete from `selections`, `market_odds`, `market_probability_overrides`, `market_multiplier_overrides` for that athlete in those markets
  4. Delete the tournament entry
  5. Regenerate odds for affected markets
  6. Invalidate all relevant query keys (markets, selections, odds, overrides)

**One-time cleanup**: Run SQL to delete stale rows for Kolman Martin and Vaughn Corey from `selections`, `market_odds`, `market_probability_overrides`, `market_multiplier_overrides` in Moomba Masters markets, then regenerate odds for those markets.

## Issue 2: Rank #1 Has Lower Probability Than Rank #2

**Root Cause**: In `generate-market-odds/index.ts`, the `deriveMultipliersCalibrated` function has a monotonic enforcement step (lines 438-450) inside the calibration loop, but:
1. Each loop iteration recalculates multipliers from `p_adjusted` (line 414), wiping the previous monotonic fix
2. The "forced scaling pass" (lines 467-504) scales all multipliers uniformly, breaking monotonicity again
3. The "final force-in pass" (lines 506-544) also doesn't re-enforce monotonicity

**Fix** in `supabase/functions/generate-market-odds/index.ts`:
- Add a **final monotonic enforcement pass** at the very end of `deriveMultipliersCalibrated`, after all calibration and scaling is complete (just before the return at line 577)
- This ensures that regardless of what the calibration loop does, the returned multipliers always satisfy: rank 1 multiplier <= rank 2 multiplier <= rank 3 multiplier (lower multiplier = higher probability = better rank)

```typescript
// Final monotonic enforcement - after ALL calibration
if (bestResult) {
  const sorted = athleteIds
    .map((id, i) => ({ id, idx: i, fieldRank: fieldRanks.get(id)!, mult: bestResult.multipliers[i] }))
    .sort((a, b) => a.fieldRank - b.fieldRank);
  
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].mult < sorted[i-1].mult) {
      sorted[i].mult = sorted[i-1].mult; // At minimum, equal to previous rank
    }
  }
  sorted.forEach(s => { bestResult.multipliers[s.idx] = s.mult; });
  bestResult.impliedSum = bestResult.multipliers.reduce((s, m) => s + (1/m), 0);
}
```

## Files Changed
- `src/pages/admin/TournamentEntries.tsx` — cascade delete to selections/market_odds/overrides + regenerate odds
- `supabase/functions/generate-market-odds/index.ts` — final monotonic enforcement pass
- One-time data cleanup via SQL for Kolman/Vaughn stale rows + odds regeneration

