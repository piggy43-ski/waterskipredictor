

# Fix: Field Rank Should Reflect Actual Strength, Not Just World Rank

## Problem
The screenshot shows Browne Samuel as `#1` with 12.6% winner probability, but Winter Frederick at `#2` has 15.5% — a higher probability. The "Rank" column doesn't match the probability ordering.

**Root cause**: In `supabase/functions/generate-market-odds/index.ts` line 174, `calculateWinnerBaseProbabilities()` sorts athletes by `worldRank` first, then by `rating` as a tiebreaker. This sorting determines both:
1. The `fieldRank` (displayed as "#1", "#2", etc.)
2. The weight ladder assignment (which base probability weight each athlete gets)

But the final probability also incorporates a strength score based on ratings (line 196-198). When an athlete has a better world rank but lower rating, they get a better field rank position but can end up with a lower final probability — creating the inconsistency you see.

## Fix

Change the sorting in `calculateWinnerBaseProbabilities()` to sort by **rating first** (higher = better), then world rank as tiebreaker. This ensures:
- The athlete with the highest rating gets field rank #1 and the highest base weight
- World rank only matters when ratings are equal
- The displayed rank will always align with the probability ordering

**File**: `supabase/functions/generate-market-odds/index.ts` (lines 173-179)

**Before**:
```typescript
const sorted = [...athletes].sort((a, b) => {
  const aRank = a.worldRank ?? Infinity;
  const bRank = b.worldRank ?? Infinity;
  if (aRank !== bRank) return aRank - bRank;
  return (b.rating ?? 0) - (a.rating ?? 0);
});
```

**After**:
```typescript
const sorted = [...athletes].sort((a, b) => {
  // Primary sort: rating (higher = better)
  const ratingDiff = (b.rating ?? 70) - (a.rating ?? 70);
  if (Math.abs(ratingDiff) >= 0.5) return ratingDiff;
  // Tiebreaker: world rank (lower = better)
  const aRank = a.worldRank ?? Infinity;
  const bRank = b.worldRank ?? Infinity;
  return aRank - bRank;
});
```

This single change ensures field rank #1 always goes to the strongest athlete by rating, and the weight ladder aligns with the probability output. After deploying, you'll need to regenerate odds for affected markets.

