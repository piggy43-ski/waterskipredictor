

## Problem: Missing Athletes in Fantasy Team Builder

### Root Cause

The fantasy team builder filters athletes using **two independent sources** that contradict each other:

1. `tournament_entries` — records which athletes are entered for which disciplines at Moomba (e.g., Jake Abelson entered for jump)
2. `athletes.disciplines` — a static array on the athlete record (e.g., Jake Abelson has `[trick]` only)

The code fetches athlete IDs from `tournament_entries`, then filters them again by checking `athlete.disciplines.some(d => disciplines.includes(d))`. **22 entries** have a discipline in `tournament_entries` that isn't in the athlete's `disciplines` array, causing those athletes to be silently dropped.

### Fix

**In `src/pages/FantasyPotDetail.tsx`** (and similarly in `src/pages/FantasyTeamEdit.tsx` if it has the same pattern):

Instead of only fetching athlete IDs from `tournament_entries`, also fetch the **disciplines each athlete is entered for**. Then, when filtering, check against the tournament entry disciplines rather than the athlete's static `disciplines` field.

Specifically:
- Fetch `athlete_id` **and** `discipline` from `tournament_entries`
- Build a map of `athlete_id → Set<discipline>`
- Replace the filter at line 178 from checking `athlete.disciplines` to checking the tournament entry disciplines
- This ensures that if an athlete is entered for jump at Moomba, they appear in the jump tab regardless of what their global `disciplines` array says

Additionally, the athlete's static `disciplines` array should ideally be updated to reflect all disciplines they actually compete in. A one-time data fix (UPDATE query) can correct the 22 mismatched entries by adding the missing discipline to each athlete's `disciplines` array.

### Secondary Fix (Data Cleanup)

Run a data update to sync `athletes.disciplines` with the disciplines they're actually entered for in tournaments:

```sql
UPDATE athletes SET disciplines = disciplines || ARRAY[te.discipline]
FROM tournament_entries te
WHERE te.athlete_id = athletes.id
AND NOT (athletes.disciplines @> ARRAY[te.discipline]);
```

This prevents the same issue from recurring in other parts of the app that rely on `athletes.disciplines`.

