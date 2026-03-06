

## Add Injury Flag to Tournament Page

### What
Show an injury indicator (e.g., a small "Injured" badge or 🏥 icon) next to athletes who have `injury_flag = true` on the tournament detail page.

### Where
**`src/components/SelectionCard.tsx`** -- This is the card component that renders each athlete in the tournament markets. The athlete data (including `injury_flag`) is already available via `selection.athlete`.

### Changes

1. **SelectionCard.tsx**: Add an injury badge next to the athlete name/rank area when `selection.athlete.injury_flag` is `true`.
   - Add a small orange/amber badge with text like "🏥 Injured" or "Returning from injury" near the athlete name row (line ~88-95).
   - This requires no new data fetching since `athlete.*` is already joined in the selections query.

2. **PodiumSelectionCard.tsx** (if it also displays athletes): Check if it has the same athlete data and add the same indicator for consistency.

### No database or backend changes needed.

