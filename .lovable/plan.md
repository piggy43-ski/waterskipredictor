

# Add Tie-Break Score Support for Tournament Results

## Problem
When two athletes have identical final scores (e.g., both scored `1,00/58/9.75` in slalom finals), the system assigns arbitrary sequential ranks instead of using a tie-break score. In waterski, ties are broken using the preliminary round score -- Nate Smith's tie-break of `2,50/58/10.25` beats Charlie Ross's `1,50/58/10.25`, making Nate 1st and Charlie 2nd.

Currently the `calculateRankings` function just does `sort by raw_score` and assigns `index + 1` as rank, ignoring ties entirely.

## Solution
Add a `tie_break_score` field and update the ranking logic to use it as a secondary sort key when athletes share the same `raw_score`.

## Implementation

### 1. Database Migration
Add a `tie_break_score` column to `tournament_results`:

```sql
ALTER TABLE tournament_results 
ADD COLUMN tie_break_score numeric DEFAULT NULL;
```

No RLS changes needed -- same policies apply.

### 2. Frontend: Update `ResultEntry` type
Add `tie_break_score` to the type:

```typescript
type ResultEntry = {
  // ... existing fields
  tie_break_score: number; // Secondary score for breaking ties
};
```

### 3. Update `calculateRankings` function
Change the sort to use `tie_break_score` as secondary:

```typescript
const sorted = [...validEntries].sort((a, b) => {
  const scoreDiff = b.raw_score - a.raw_score;
  if (scoreDiff !== 0) return scoreDiff;
  // Tie-break: higher tie_break_score wins
  return (b.tie_break_score || 0) - (a.tie_break_score || 0);
});
```

### 4. Auto-populate tie-break from preliminary round
When in the finals tab and two athletes have equal scores, automatically look up their preliminary round scores and use those as tie-break values. This means the system will:
- Check if `results.qual[discipline][gender]` has entries for the tied athletes
- Use their preliminary `raw_score` as the `tie_break_score`
- Fall back to manual entry if no preliminary data exists

### 5. Add tie-break input field in the UI
Add a small optional input next to the score field labeled "TB" (tie-break) that:
- Appears for all entries but is optional
- Auto-fills from preliminary scores when available
- Can be manually overridden
- Uses the same score parsing logic (slalom format or numeric)

### 6. Update save mutation
Include `tie_break_score` in the upsert payload sent to the database.

### 7. Update `initializeRoundResults` and related helpers
Add `tie_break_score: 0` to default entry creation.

## Technical Details

### Files modified:
- `src/pages/admin/TournamentSettlement.tsx` -- ResultEntry type, calculateRankings, UI, save mutation, initializeRoundResults
- Database migration -- add `tie_break_score` column

### How it works end-to-end:
1. Admin enters finals scores for Nate and Charlie -- both get `1,00/58/9.75` (same raw_score)
2. System detects the tie and auto-pulls their preliminary scores as tie-break values
3. Nate's prelim `3,00/58/10.25` > Charlie's `4,00/58/10.25` (wait -- actually in slalom, these get parsed to comparable values via `parseSlalomScore`)
4. Rankings update: Nate = 1st, Charlie = 2nd
5. Admin can manually override the tie-break score if the auto-pull is wrong
