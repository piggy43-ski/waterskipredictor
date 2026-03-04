

# Restore Preview Dialog with Explicit Opt-In

## Problem
The current flow auto-adds all high-confidence matches without review. The user can't verify the AI did a good job — e.g., men's jump had 20 athletes on the start list but only 12 matched. The 8 missing ones were silently skipped with no way to create them.

## Plan

### File: `src/pages/admin/TournamentEntries.tsx`

**Revert `handleParseFiles` (lines 365-383) to show the preview dialog instead of auto-adding.**

Replace the auto-add block with:
```typescript
setMatchedParticipants(deduplicated);
setShowPreviewDialog(true);
toast.success(`Parsed ${data.participants.length} participants, ${deduplicated.filter(p => p.matchedAthlete && p.confidence >= 0.7).length} matched`);
```

Key points:
- `selected: false` is already set on line 319 — no participant is pre-selected
- The existing preview dialog UI (which still exists in the JSX further down) shows all participants with match status
- Matched athletes show with a checkmark the admin must manually tick to include
- Unmatched athletes show with "Create & Add" option to create a new athlete profile
- The "Add Selected" button in the dialog footer commits only explicitly selected athletes
- Nothing is added to the database until the admin clicks "Add Selected"

This is essentially a 5-line change: remove the auto-add logic (lines 365-383) and replace with the 3 lines that populate state and open the dialog.

