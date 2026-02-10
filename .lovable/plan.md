

# Fix: TB Field Must Accept Slalom-Format Scores (e.g., `2.5@41`)

## Problem
The TB input's `onBlur` handler calls `parseFloat("2.5@41")` which returns `2.5`, discarding the `@41` rope information. The `tie_break_score` column is stored as `numeric` in the database, so it fundamentally cannot hold slalom notation like `2.5@41`.

For slalom tie-breaking to work correctly, the system needs to store and compare full slalom strings (e.g., `2.5@41` vs `1.5@41`), since the rope length is critical to the comparison.

## Solution
Change `tie_break_score` from a numeric column to a **text** column so it can hold full slalom strings, and use the existing `parseSlalomScore` / `compareScores` utilities from `waterskiScoring.ts` for proper ranking comparison.

## Changes

### 1. Database Migration
Change the column type from `numeric` to `text`:

```sql
ALTER TABLE tournament_results 
ALTER COLUMN tie_break_score TYPE text USING tie_break_score::text;
```

### 2. `src/pages/admin/TournamentSettlement.tsx`

**Update `ResultEntry` type**: Change `tie_break_score` from `number` to `string`.

**Update ranking comparison** (line ~349-351): Replace the plain numeric comparison with discipline-aware comparison using the existing `compareScores` function from `waterskiScoring.ts`:

```typescript
import { compareScores } from '@/utils/waterskiScoring';

const sorted = [...validEntries].sort((a, b) => {
  const scoreDiff = b.raw_score - a.raw_score;
  if (scoreDiff !== 0) return scoreDiff;
  // Use discipline-aware comparison for tie-break
  return compareScores(b.tie_break_score || '', a.tie_break_score || '', discipline);
});
```

This means for slalom, `2.5@41` vs `1.5@41` will be compared using proper rope+buoy logic. For trick/jump, plain numeric comparison still works.

**Update onBlur handler**: Stop calling `parseFloat`. Instead, store the raw string directly:

```typescript
onBlur={() => {
  const tbKey = `tb-${entry.athlete_id}`;
  const raw = tbEditState[tbKey];
  if (raw !== undefined) {
    updateResultRow(..., 'tie_break_score', raw.trim());
    // mark as manually set, clear edit state
  }
})
```

**Update auto-populate logic**: When pulling qual scores as tie-break values for finals, store the score *display string* (which contains the slalom notation) rather than `raw_score` (a plain number).

**Update value display**: Change the check from `entry.tie_break_score > 0` to `entry.tie_break_score && entry.tie_break_score !== '0'`.

**Update save mutation**: The upsert payload already sends `tie_break_score` -- just ensure it sends the string value.

**Update defaults**: Change `tie_break_score: 0` to `tie_break_score: ''` in initialization.

### Files Modified
- Database migration (alter column type)
- `src/pages/admin/TournamentSettlement.tsx` (type, comparison, input handling, auto-populate, defaults)

