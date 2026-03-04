

# Fix AI Match Preview Dialog: Scroll, Suggestions, and Duplicates

## Issues
1. **Can't scroll down in dialog** — The `DialogContent` has `max-h-[85vh]` but the content above the `ScrollArea` (stats bar, bulk buttons, warnings, info banner) takes significant space, leaving the `ScrollArea` with `h-[50vh]` unable to show all participants.
2. **System suggests alternatives** — The `ParticipantMatchRow` component shows alternative suggestions and "Not this person" buttons, adding complexity. The user wants just the matched names displayed simply.
3. **Duplicates when uploading multiple files** — The mutation checks `existingSet` from DB but doesn't prevent adding the same athlete twice within the same batch if they appear in multiple uploads.

## Plan

### File: `src/pages/admin/TournamentEntries.tsx`

**1. Fix scroll (line 1530, 1616)**
- Change `DialogContent` from `max-h-[85vh]` to `max-h-[90vh]` and add `flex flex-col`
- Change `ScrollArea` from `h-[50vh]` to `flex-1 min-h-0` so it fills remaining space
- Reduce/remove some of the info banners above the scroll area to give more room

**2. Simplify participant rows — remove alternative suggestions display**
- In `ParticipantMatchRow`, remove the alternatives dropdown section entirely
- Remove the "Not this person" button and reject/undo flow from the display
- Keep it simple: show parsed name → matched name (or "No match") with a checkbox
- Keep the "Create & Add" option for unmatched athletes

**3. Prevent duplicates across uploads**
- In `addAIEntriesMutation`, deduplicate `entriesToAdd` array by `athlete_id + discipline` key before inserting
- Use `upsert` with `onConflict: 'tournament_id,athlete_id,discipline'` (already partially done but ensure it's used consistently)
- Also deduplicate within the matching phase: if an athlete is already in `entries` (current tournament entries), mark them as "already added" and don't allow re-selection

### Files Changed
- `src/pages/admin/TournamentEntries.tsx`

