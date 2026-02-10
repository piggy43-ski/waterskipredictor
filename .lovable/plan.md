

# Enable Results Entry for Live + Finished Tournaments

## Problem
The Tournament Settlement page (which has the full results entry UI with round selection, score parsing, AI parsing, etc.) only shows **finished** tournaments. The BETA TESTING tournament is currently **live** (ends today at 18:00 UTC), so it doesn't appear in the dropdown.

Meanwhile, the Market Results page you're on requires raw CSV with UUIDs -- not practical.

## Solution
A single-line filter change: allow both **live** and **finished** tournaments to appear in the Tournament Settlement page dropdown. This lets you enter semi and finals results while the tournament is still running.

## Implementation

### File: `src/pages/admin/TournamentSettlement.tsx` (line 164)

Change the filter from:
```typescript
return data.map(applyDynamicStatus).filter(t => t.status === 'finished');
```
to:
```typescript
return data.map(applyDynamicStatus).filter(t => t.status === 'finished' || t.status === 'live');
```

That's it -- one line change. The BETA TESTING tournament will immediately appear in the Tournament Settlement dropdown, giving you access to:
- Round selector (Semi / Final tabs)
- Per-discipline, per-gender athlete lists with score entry
- Auto-ranking calculation
- AI image parsing for score sheets
- Save results to `tournament_results` table

### After entering results
Once results are saved and the tournament finishes (after 18:00 UTC today), you can proceed with settlement (settling predictions, updating ratings, etc.) as normal.

