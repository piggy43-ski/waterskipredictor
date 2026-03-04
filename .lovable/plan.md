

# Fix: Beta Testing 2 Not Appearing in Tournament Dropdown

## Problem
Line 183 of `TournamentSettlement.tsx` filters the tournament list:
```
return data.map(applyDynamicStatus).filter(t => t.status === 'finished' || t.status === 'live');
```
Beta Testing 2 starts at 8:00 AM UTC March 4 (still in the future), so `applyDynamicStatus` assigns it `upcoming` status and it gets excluded from the dropdown.

## Fix

**File: `src/pages/admin/TournamentSettlement.tsx` (line 183)**

Remove the status filter entirely. Admins should be able to select any tournament for score entry and settlement -- there is no reason to restrict this. The dropdown will show all tournaments sorted by date (newest first), which is already the case.

Change:
```ts
return data.map(applyDynamicStatus).filter(t => t.status === 'finished' || t.status === 'live');
```
To:
```ts
return data.map(applyDynamicStatus);
```

This is a one-line change. Beta Testing 2 will immediately appear in the dropdown.

