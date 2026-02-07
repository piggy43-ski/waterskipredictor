# Plan: Fix Specialist Filter (COMPLETED)

## Summary
Updated the specialist filter in `generate-market-odds` to include athletes with:
- `seed_rank` (explicitly seeded athletes)
- `rating >= 70` (changed from `> 70`)

## Change Applied
```typescript
// Before:
const hasMeaningfulRating = (entryRating && entryRating > 70) || ...
return hasWorldRank || hasEntryDisciplineRank || hasMeaningfulRating;

// After:
const hasSeedRank = e.seed_rank !== null && e.seed_rank !== undefined;
const hasMeaningfulRating = (entryRating && entryRating >= 70) || ...
return hasWorldRank || hasEntryDisciplineRank || hasSeedRank || hasMeaningfulRating;
```

## Result
- María Delfina Cuglievan Wiese (and any other seeded athletes) will now be included
- Women's Trick markets will show all 9 athletes instead of 8
- House edge math confirmed correct (8-10% for WINNER markets)
