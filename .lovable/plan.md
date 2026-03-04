

# Fix: Rejected Athletes Still Added + Font Pablo Rank Display

## Problems Identified

### Problem 1: Kolman Martin & Felipe Miranda added without user action
**Root cause**: These athletes exist in the database and are matched to participant names with high confidence (≥ 0.7). Line 319 auto-selects them: `selected: confidence >= 0.7 && !!match`. The user never explicitly opted to add them — they were auto-checked. The previous fix only addressed the `alsoAddRejectedAthlete` path, but Kolman/Miranda are going through the **normal `toAdd` path** (line 489) because they were never rejected — they were simply matched and auto-selected.

**The real issue**: The user likely didn't reject these matches because they didn't see them (they may have scrolled past), or they assumed unchecking wasn't needed. The auto-selection at confidence ≥ 0.7 is too aggressive — it silently adds athletes without explicit user confirmation.

### Problem 2: `alsoAddRejectedAthlete` being true unexpectedly
Console logs show `AI-rejected-also-add` for Appleton Kristy, Hayes Erica, Poland Joel. These ARE going through the rejected+also-add path, meaning the checkbox was checked. This could be an accidental click (the checkbox area is close to other interactive elements) or it's being set during some state transition.

### Problem 3: Font Pablo (rank 12) showing first
The monotonic enforcement pass was added but Font Pablo has a rating of 100 (from the console: `athlete=Font Pablo, discipline=trick, rank=12, rating=100`). The field ranking is by **rating first**, so rating=100 puts him at rank #1 regardless of world rank 12. This is working as designed but produces a confusing result — a rank-12 world athlete shouldn't necessarily be the favorite just because of a high rating assignment.

## Proposed Fixes

### Fix 1: Remove auto-selection — require explicit opt-in
Change line 319 from auto-selecting high-confidence matches to NOT auto-selecting. Instead, add a "Select All Matched" button that the admin can use to bulk-select.

- `selected: false` for all participants initially (instead of `confidence >= 0.7`)
- Add a "Select All Matched" button in the preview dialog header that sets `selected = true` for all participants with `confidence >= 0.7 && matchedAthlete`
- Add a "Deselect All" button
- This prevents silent additions — every athlete must be explicitly selected or bulk-confirmed

### Fix 2: Guard `alsoAddRejectedAthlete` more defensively
- Add a confirmation step or make the "Also add" checkbox more visually distinct and harder to accidentally check
- Add a brief summary before final submission showing exactly which athletes will be added via the "also add rejected" path, with names highlighted in yellow

### Fix 3: Fix Font Pablo's rating
Font Pablo's rating of 100 is likely incorrect (assigned manually or defaulted wrong). The rating should reflect his world rank 12 position. Two options:
- **Option A**: When adding entries with a world rank, auto-calculate rating from rank (e.g., rank 12 → ~75-80 rating, not 100)
- **Option B**: Flag athletes where rating dramatically disagrees with world rank as a warning in the UI

## Implementation

### File: `src/pages/admin/TournamentEntries.tsx`

1. **Line 319**: Change `selected: confidence >= 0.7 && !!match` → `selected: false`
2. **Add bulk selection buttons** in the preview dialog (near the summary stats around line 1530):
   - "Select All Matched" — sets `selected = true` for all high-confidence matches
   - "Deselect All" — clears all selections
3. **Add pre-submission summary** before the "Add Selected" button showing:
   - Count of matched athletes to add
   - Count of new profiles to create  
   - Count of "also add rejected" athletes (highlighted as warning if > 0)
   - List the "also add rejected" athlete names explicitly
4. **Rating guard**: When creating entries, if an athlete has a world rank AND a rating that seems mismatched (e.g., rank > 10 but rating = 100), log a warning. Don't auto-fix, but surface it.

### Files Changed
- `src/pages/admin/TournamentEntries.tsx` — remove auto-select, add bulk buttons, add pre-submission summary

