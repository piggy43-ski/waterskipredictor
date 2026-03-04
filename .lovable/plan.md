

# Fix: Settled Tournament Showing as "Upcoming"

## Problem
"BETA TESTING 2" has `settled_at` set (already settled) but its `start_datetime` is today at 08:00 UTC and `end_datetime` is 18:00 UTC. The dynamic status calculator ignores `settled_at` entirely, so depending on the current time it shows as "upcoming" or "live" instead of "finished".

## Root Cause
`calculateTournamentStatus()` in `src/utils/tournamentStatus.ts` only looks at start/end datetimes. It never checks `settled_at`. A settled tournament should always be "finished".

## Fix

**File: `src/utils/tournamentStatus.ts`**

Add `settled_at` as a parameter to `calculateTournamentStatus`. If it's set, immediately return `'finished'` before any date comparison:

```typescript
export const calculateTournamentStatus = (
  startDatetime?: string,
  endDatetime?: string,
  fallbackStartDate?: string,
  fallbackEndDate?: string,
  settledAt?: string | null
): Tournament['status'] => {
  // If already settled, it's finished regardless of dates
  if (settledAt) return 'finished';
  
  // ... rest unchanged
};
```

Update `applyDynamicStatus` to pass `settled_at`:

```typescript
export const applyDynamicStatus = (tournament: any): Tournament => ({
  ...tournament,
  status: calculateTournamentStatus(
    tournament.start_datetime,
    tournament.end_datetime,
    tournament.start_date,
    tournament.end_date,
    tournament.settled_at
  )
});
```

This is a one-file, two-line change. The tournament will immediately show as "Finished" since it has `settled_at` set.

