

# Fix: Overall Rating for New Athletes + Smarter Suggestion Logic

## Two Issues

### Issue 1: No overall/rating field when creating new athletes
When you click "Create & Add" for an unmatched athlete, they get hardcoded to rating 55. You want to set their overall rating yourself (e.g. 70 for a returning-from-injury skier, 60 for a true unknown).

**Fix**: Add a rating input field next to the "Create & Add" section. Store it in a new `newAthleteRating` field on the `MatchedParticipant` interface. Use it instead of the hardcoded 55 when inserting the new athlete.

**File: `src/pages/admin/TournamentEntries.tsx`**
- Add `newAthleteRating?: number` to `MatchedParticipant` interface (line 62)
- Add handler in `handleUpdateNewAthlete` for `'rating'` field
- In the `addAIEntriesMutation` (line 431-466), use `p.newAthleteRating ?? 55` instead of hardcoded 55
- In the create section UI (lines 1781-1841), add a rating input (50-100) next to country/gender

### Issue 2: Suggesting already-in-list athletes instead of just adding them
When parsing names like "Joel O'Toole" (unranked), the fuzzy match finds "Joel Poland" and suggests it. But if Joel Poland is already on the parsed list, the suggestion is redundant — the system should just mark "Joel O'Toole" as unmatched and let you create a new profile, without suggesting athletes that are already matched elsewhere in the same import.

**Fix**: After matching, filter out alternatives that are already matched as a primary match for another participant. If a fuzzy match's best result is an athlete already matched to someone else in the batch, treat it as "not found" instead of showing a misleading suggestion.

**File: `src/pages/admin/TournamentEntries.tsx`**
- After the initial matching loop (around line 326), add a post-processing step:
  - Collect all athlete IDs that have a high-confidence primary match
  - For each participant, remove alternatives whose ID is already a primary match
  - If a participant's own match is already claimed by another participant with higher confidence, downgrade to "not found"

This way, "Joel O'Toole" won't show "Joel Poland" as a suggestion when Joel Poland is already correctly matched to his own entry in the list.

