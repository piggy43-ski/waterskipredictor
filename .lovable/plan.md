

# Skip AI Preview Dialog — Auto-Add Matched Athletes on Parse

## Problem
Every time the user hits "Parse", it opens a review dialog with suggestions, match alternatives, and manual selection. The user wants to skip this and directly add all successfully matched athletes.

## Plan

### File: `src/pages/admin/TournamentEntries.tsx`

Modify `handleParseFiles` (line 253) so that after matching participants to athletes, instead of opening the preview dialog, it:

1. Takes all participants with a high-confidence match (`confidence >= 0.7` and `matchedAthlete` exists)
2. Auto-sets `selected = true` and `selectedDisciplines = [uploadDiscipline]` on each
3. Calls `addAIEntriesMutation.mutate(...)` directly with these auto-selected participants
4. Shows a toast summarizing results: "Added X athletes, Y unmatched (skipped)"
5. Skips opening `showPreviewDialog` entirely

Unmatched participants (no match or low confidence) are simply skipped with a warning toast listing their names so the admin knows who wasn't added.

### Changes (lines ~365-369)
Replace:
```typescript
setMatchedParticipants(deduplicated);
setShowPreviewDialog(true);
toast.success(`Found ${data.participants.length} participants, matched ${matchedCount}`);
```

With logic that:
- Filters deduplicated to those with `matchedAthlete && confidence >= 0.7`
- Sets `selected = true` and `selectedDisciplines = [uploadDiscipline]` on each
- Calls `addAIEntriesMutation.mutate(autoSelected)`
- If there are unmatched names, shows a warning toast listing them
- Does NOT open the preview dialog

