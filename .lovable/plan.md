

## Fix: Missing Podium & Highest Score Markets for Swiss Pro Tricks

### Root Cause
The Swiss Pro Tricks tournament only has **WINNER** markets (Men's and Women's). No **PODIUM** or **HIGHEST_SCORE** markets were created. The Parlay Builder requires all 3 market types as mandatory sequential steps, so users get stuck at the podium step with "No podium market available" and can only discard or exit.

### Fix (Two Parts)

**Part 1 — Create the missing markets now**
Invoke the `auto-generate-markets` edge function for tournament `7bf0f645-54f5-497a-9b95-208c01fb9609` with `force: true`. This will create the PODIUM and HIGHEST_SCORE markets for both Men's and Women's Trick, generate selections, and run Monte Carlo odds generation — exactly as it does for other tournaments.

**Part 2 — Make ParlayBuilder resilient to missing market types**
Update `src/components/ParlayBuilder.tsx` so that:
- If no PODIUM market exists for the selected discipline/gender, skip the podium step entirely (go from winner → highest_score or straight to summary).
- If no HIGHEST_SCORE market exists, skip that step too.
- A leg is marked `isComplete` once all **available** steps are filled (not all 3 hardcoded types).
- The summary display gracefully handles missing podium/highest score picks.

This prevents users from ever getting stuck again if a tournament only has partial market types.

### Files Changed
- `src/components/ParlayBuilder.tsx` — Add skip logic for missing market types in step navigation

### No Frontend Visual Changes
The parlay flow will simply skip unavailable steps rather than showing an error.

