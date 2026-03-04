
Goal: prevent rejected suggested athlete (e.g., Kolman) from being added unless “Also add …” is explicitly checked.

What’s actually broken:
- In `src/pages/admin/TournamentEntries.tsx`, `handleRejectMatch` marks a participant as rejected but keeps `matchedAthlete` populated.
- When “Create & Add” is checked, `handleUpdateNewAthlete('create')` sets `selected = true`.
- In `addAIEntriesMutation`:
  - new-athlete creation only runs for `p.createNewAthlete && !p.matchedAthlete`.
  - because `matchedAthlete` is still the rejected athlete, no new profile is created.
  - the participant is still included in `toAdd` and inserts the rejected athlete.
- This bypasses the intended “Also add rejected athlete” checkbox logic.

Implementation plan:
1. Fix rejected-state data model
- On reject, move current match into `originalMatchedAthlete` and clear active `matchedAthlete`.
- Also reset `alsoAddRejectedAthlete` to `false` during reject/undo so no stale opt-in survives.

2. Fix row rendering for rejected rows
- In `ParticipantMatchRow`, show the struck-through name from `originalMatchedAthlete` (not `matchedAthlete`) when rejected.
- Keep the current UX wording unchanged.

3. Fix create-new-athlete mutation path
- Ensure rejected+create flow always creates a new athlete record.
- Keep `alsoAddRejectedAthlete` as the only path that re-adds the original rejected athlete.
- Harden boolean handling for checkbox events (`boolean | "indeterminate"`), coercing to strict booleans.

4. Guard insertion path
- In `toAdd`/entry construction, skip using rejected original athlete unless `alsoAddRejectedAthlete === true`.
- Add explicit branch logic:
  - primary add = selected matched athlete (non-rejected) OR created new athlete
  - optional second add = original rejected athlete only when opted in.

5. Verify and prevent regressions
- Add temporary logs around rejected rows showing:
  - `matchRejected`, `createNewAthlete`, `matchedAthlete?.id`, `originalMatchedAthlete?.id`, `alsoAddRejectedAthlete`.
- Manual scenario checks:
  - Reject + Create & Add + also-add unchecked => only new profile added.
  - Reject + Create & Add + also-add checked => both added.
  - Reject + choose alternative => only alternative added.
  - Undo reject => original behavior restored.

Files to update:
- `src/pages/admin/TournamentEntries.tsx` (reject/undo handlers, participant row rendering, checkbox coercion, add mutation filtering/branching)

Expected outcome:
- If you do not check “Also add Kolman…”, Kolman will not be inserted.
- “Create & Add” will correctly create/add only the new athlete profile in rejected-match flows.
