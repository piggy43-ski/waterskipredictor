

# Fix: Font Pablo Wrong Rating + Remove Miranda Felipe

## Problem 1: Font Pablo (rank 12) showing first
His `tournament_entries.rating_0_100 = 100` but his actual `current_rating_trick = 75`. The entry was created with a stale/incorrect rating. The pricing engine uses `rating_0_100` from `tournament_entries` (cached at entry time), so he appears as the #1 favorite despite being world rank #12.

## Problem 2: Miranda Felipe shouldn't exist
He has no world rank for trick (`current_rank_trick = null`) and was added to the tournament despite the user not selecting him. This is likely a leftover from a previous auto-selection bug.

## Fixes

### 1. One-time data cleanup (SQL)
- Update Font Pablo's `rating_0_100` from 100 to 75 (his actual `current_rating_trick`)
- Delete Miranda Felipe's tournament entry for trick (he has no trick rank and shouldn't be there)
- Delete Miranda Felipe's related `selections`, `market_odds`, `market_probability_overrides`, `market_multiplier_overrides` rows
- Regenerate odds for affected markets

### 2. Code guard: validate rating_0_100 on entry creation
In `src/pages/admin/TournamentEntries.tsx`, add a sanity check in both the AI-add and manual-add paths: if `rating_0_100` exceeds 99 and the athlete's world rank is > 5, cap the rating based on their rank. This prevents future stale/incorrect ratings from creating pricing anomalies.

Specifically in `getDisciplineData` (line 529):
```typescript
const getDisciplineData = (athlete: any, discipline: string) => {
  const rankField = `current_rank_${discipline}`;
  const ratingField = `current_rating_${discipline}`;
  const rank = athlete?.[rankField] as number | null ?? null;
  let rating = athlete?.[ratingField] as number | null ?? 70;
  
  // Sanity: if rank is > 10 but rating is >= 95, cap rating
  if (rank && rank > 10 && rating >= 95) {
    console.warn(`[ENTRY] Rating sanity: ${athlete?.name} rank=${rank} but rating=${rating}, capping`);
    rating = Math.max(70, 90 - (rank - 10));
  }
  
  return { rank, rating };
};
```

### 3. After cleanup, regenerate odds for all Moomba trick markets

## Files Changed
- `src/pages/admin/TournamentEntries.tsx` — rating sanity guard in `getDisciplineData`
- SQL cleanup for Font Pablo rating + Miranda Felipe removal + odds regeneration

