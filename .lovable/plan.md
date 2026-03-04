
Goal: Fix the AI Match Preview dialog so you can always scroll to the bottom and confirm/add athletes.

What I found
- The preview uses:
  - `DialogContent` with `max-h-[90vh] flex flex-col overflow-hidden`
  - `ScrollArea` with `flex-1 min-h-0`
- In this setup, the scroll container can fail when parent height is only `max-h` (not a fixed height), especially with large header/toolbars above it.
- There is also a Radix warning in console: missing dialog description (`DialogContent` accessibility warning).

Implementation plan (single file: `src/pages/admin/TournamentEntries.tsx`)
1. Make dialog height deterministic
- Change preview `DialogContent` from `max-h-[90vh]` to a fixed viewport height like `h-[90vh] max-h-[90vh]`.
- Keep `flex flex-col overflow-hidden` so internal regions can scroll instead of the modal growing.

2. Make list area explicitly scrollable
- Update the preview `ScrollArea` to ensure it has real height in the flex column:
  - Keep `flex-1 min-h-0`
  - Add `h-full` (and optional `pr-2`) so viewport gets a concrete height.
- Ensure participant wrapper does not reintroduce overflow locks.

3. Keep footer always reachable
- Keep `DialogFooter` outside the scrolling region (already correct).
- Ensure only the participants region scrolls; header/stats/buttons remain fixed.

4. Add required dialog description (quick accessibility fix)
- Add a `DialogDescription` under title (e.g., “Review matches and select entries to add”).
- This removes the runtime warning and improves modal semantics.

5. Verify no regression to your workflow
- Keep current behavior intact:
  - No auto-add
  - You confirm selections manually
  - Create & Add remains available
  - Duplicate-protection logic remains unchanged

Validation checklist
- Open AI parse preview with long men/women lists.
- Confirm mouse wheel/trackpad scroll reaches final rows.
- Confirm footer buttons remain visible and usable.
- Confirm “Create & Add” rows at bottom are reachable.
- Confirm console no longer shows missing Dialog Description warning.
