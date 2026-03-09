

## Fix: AI-parsed results going to wrong round

### Problem
When you parse an image with "Semi-Finals" selected, the `applyAIResults` function auto-detects the round type from the AI response (lines 596-604). If the AI returns `round_type: 'final'` (or anything other than `'semi'`), it overrides your manual selection and writes the results into the Finals tab instead.

### Root Cause
Lines 596-618 in `TournamentSettlement.tsx`:
```js
const detectedRound = roundVotes.length > 0
  ? roundVotes.sort(...)[0]   // AI's guess wins
  : selectedRound;            // user's choice is only fallback
```

The AI's detected round always takes priority over the user's explicit tab selection.

### Fix

1. **In `applyAIResults`** (line ~593): Remove the auto-detection of `round_type`. Always use `selectedRound` (the round tab the user has actively selected) as the target round. Keep the auto-detection of `discipline` since that's helpful and less error-prone.

2. **In the AI Preview Dialog** (~line 2117): Show the detected round/discipline as informational badges so the admin can verify, and add a round selector dropdown in the dialog so the admin can override before clicking "Apply". This way the admin always has final say.

### Changes
- **File**: `src/pages/admin/TournamentSettlement.tsx`
  - `applyAIResults`: Replace `targetRound = detectedRound` with `targetRound = selectedRound`. Remove `setSelectedRound(targetRound)` for round (keep discipline auto-switch).
  - AI Preview Dialog: Add a `Select` dropdown for round type so the user can confirm/change the target round before applying. Display the AI-detected round as a suggestion badge.

