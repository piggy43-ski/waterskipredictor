
# Add Inline Multiplier Editing to Tournament Entries

## Overview
Add click-to-edit multiplier functionality directly in the "Current Entries" list on the Tournament Entries page. This allows you to see and modify multipliers for already-added athletes without leaving the page.

---

## Current Behavior
- Current entries show multiplier as read-only text: `Multiplier: 2.50x`
- To change a multiplier, you must navigate to the separate "Market Odds Review" or "Probability Editor"
- No inline editing capability

## New Behavior
- Click on the multiplier value to enter edit mode
- An input field appears with the current value
- Press **Enter** to save (creates a multiplier override)
- Press **Escape** or click away to cancel
- Shows "MANUAL" badge after override is saved
- Instant visual feedback with save confirmation

---

## Implementation

### File: `src/pages/admin/TournamentEntries.tsx`

**1. Add State for Inline Editing (around line 70)**
```text
const [editingEntry, setEditingEntry] = useState<string | null>(null);
const [editMultiplier, setEditMultiplier] = useState<string>('');
```

**2. Add Mutation for Saving Multiplier Override (after deleteEntryMutation)**
```text
const updateMultiplierMutation = useMutation({
  → Fetch the WINNER market for this entry's discipline/category
  → Upsert into market_multiplier_overrides with reason "Edited inline"
  → Update selections.decimal_odds to match
  → Invalidate queries
});
```

**3. Modify the Entry Row Display (lines 1015-1037)**

Replace the static multiplier text with an inline-editable component:

```text
Current:
  <span className="text-sm text-muted-foreground">
    Multiplier: {formatMultiplier(entry.custom_odds || 2.5)}
  </span>

New:
  {editingEntry === entry.id ? (
    <Input
      type="number"
      step="0.1"
      min="1.5"
      max="25"
      value={editMultiplier}
      onChange={(e) => setEditMultiplier(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      autoFocus
      className="w-20 h-7"
    />
  ) : (
    <button onClick={() => startEditing(entry)}>
      {formatMultiplier(multiplier)}
      {hasOverride && <Badge>MANUAL</Badge>}
    </button>
  )}
```

**4. Add Event Handlers**
- `startEditing(entry)`: Set editingEntry ID and populate input
- `handleKeyDown(e)`: If Enter, save; If Escape, cancel
- `handleBlur()`: Cancel editing
- `saveMultiplier()`: Call mutation to save override

---

## Visual Flow

```text
┌────────────────────────────────────────────────────────────────┐
│ Current Entries (5)                                            │
├────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ Freddie Winter    [slalom]    S:3   [2.50x] ←click  [🗑] │   │
│ └──────────────────────────────────────────────────────────┘   │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ Joel Poland       [slalom]    S:5   [___3.25___] [🗑]    │   │
│ │                                     ↑ editing mode       │   │
│ └──────────────────────────────────────────────────────────┘   │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ Thomas Degasperi  [slalom]    S:7   [4.00x] MANUAL  [🗑] │   │
│ │                                     ↑ has override       │   │
│ └──────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

---

## Technical Details

### Required Data Fetching
Add a query to fetch existing multiplier overrides for this tournament's markets:
```text
const { data: multiplierOverrides } = useQuery({
  queryKey: ['tournament-multiplier-overrides', selectedTournamentId],
  queryFn: async () => {
    // Get all WINNER markets for this tournament
    // Then fetch all overrides for those markets
    return overrides;
  }
});
```

### Save Logic
```sql
-- When saving multiplier override:
INSERT INTO market_multiplier_overrides 
  (market_id, athlete_id, manual_multiplier, is_enabled, reason)
VALUES 
  ($winner_market_id, $athlete_id, $new_multiplier, true, 'Edited inline on entries page')
ON CONFLICT (market_id, athlete_id) 
DO UPDATE SET manual_multiplier = $new_multiplier, is_enabled = true;

-- Also update selection:
UPDATE selections 
SET decimal_odds = $new_multiplier
WHERE market_id = $winner_market_id AND athlete_id = $athlete_id;
```

### Multiplier Caps
Apply clamping: min 1.5, max 25 (WINNER markets)

---

## Summary of Changes

| Location | Change |
|----------|--------|
| Lines ~70 | Add `editingEntry` and `editMultiplier` state |
| After line ~957 | Add `updateMultiplierMutation` mutation |
| Lines 1015-1037 | Replace static multiplier with click-to-edit component |
| Add new query | Fetch existing multiplier overrides to show MANUAL badge |

---

## Result
You can click any multiplier in the Current Entries list to edit it immediately. Changes are saved as proper multiplier overrides that persist through any automated odds recalculation. A "MANUAL" badge indicates which entries have been manually adjusted.
