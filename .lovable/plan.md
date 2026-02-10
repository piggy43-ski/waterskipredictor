

# Fix: TB Score Input Not Working

## Root Cause
Two issues prevent the tie-break field from working properly:

1. **Index-based keys shift on reorder**: The `calculateRankings` function reorders entries by score every time `updateResultRow` is called. The TB edit state uses keys like `final-slalom-male-0` (index-based), but after reordering, index 0 may now be a different athlete. The entered value appears to vanish.

2. **Auto-populate overwrites manual edits**: Every time `calculateRankings` runs for finals, it checks `if (entry.tie_break_score === 0)` and overwrites it with the qual score. If the user clears the field to type a new value, the intermediate `0` state triggers auto-populate again.

## Fix (1 file)

### `src/pages/admin/TournamentSettlement.tsx`

**Change 1: Use `athlete_id` instead of `index` for TB edit state keys**

Replace the index-based key with the athlete's ID so the edit state follows the athlete even if rows reorder:

```typescript
// BEFORE: key = `${selectedRound}-${discipline}-${gender}-${index}`
// AFTER:  key = `tb-${entry.athlete_id}`
```

**Change 2: Stop reordering entries in-place during editing**

The `calculateRankings` function should assign rank numbers (badges) without physically reordering the rows. Reordering while typing is disorienting and breaks index-based references. Only reorder on initial load or save.

Specifically: change `updateResultRow` so it still calls `calculateRankings` to compute rank numbers, but applies those ranks back to the entries in their **original order** instead of sorting them.

**Change 3: Guard auto-populate with a flag**

Add a `tb_manually_set` boolean (or simply check: only auto-populate when no TB value has ever been committed for that entry). This prevents the auto-populate from fighting manual edits.

Concretely:
- When the user sets a TB value via the input, mark it as manually set
- The auto-populate in `calculateRankings` only fills TB when it hasn't been manually set
- This lets users override the qual-based tie-break with custom values

