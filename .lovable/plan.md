

# Fix: 13 Pending Podium Predictions Not Being Settled

## Problem

All 13 unsettled predictions are **PODIUM** bets from "BETA TESTING 2". Their `selection_id` values have a `-podium` suffix (e.g., `b677f42e-...-podium`), which is a virtual/synthetic ID used to distinguish podium bets from winner bets on the same athlete.

The settlement function correctly fetches these predictions (lines 281-286 add `-podium` variants to the query). However, when it processes each selection (line 388), it looks up predictions using the **base** selection ID from the input — which doesn't have the `-podium` suffix. The predictions are stored in the map under their actual `-podium` key, so the lookup returns empty and they're silently skipped.

## Fix

**File: `supabase/functions/settle-predictions/index.ts` (~line 382-393)**

When processing each selection, also check for predictions stored under the `-podium` variant of the selection ID. Merge both sets of predictions before processing:

```typescript
// Line 388 area - change the lookup to also grab podium variants
const predictions = [
  ...(predictionsBySelection.get(selIdString) || []),
  ...(selIdString.endsWith('-podium') 
    ? [] 
    : (predictionsBySelection.get(`${selIdString}-podium`) || [])),
];
```

This one-line change ensures that when the settlement function processes selection `b677f42e-...`, it also picks up predictions stored under `b677f42e-...-podium`, so all podium bets get settled.

After deploying this fix, re-running settlement for "BETA TESTING 2" will clear all 13 pending predictions.

