

# Emergency Fix Plan: WaterSki Predictor - Reliability & UX Overhaul

This is a large scope request. To ship effectively and avoid regressions, we'll tackle it in **4 priority waves**, each delivering independently testable value.

---

## Wave 1: Implied Sum Convergence (Unblock Markets)

**Problem**: The `generate-market-odds` edge function can fail to converge, producing implied sums outside the target band (e.g., 125% vs target 87-89%). This blocks markets from being playable.

**Root Cause**: The calibration loop adjusts `k` by only 3% per iteration and gives up after 25 iterations. With aggressive rank caps clamping many athletes, 25 iterations isn't enough, and there's no final forced scaling pass.

**Fix** (in `supabase/functions/generate-market-odds/index.ts`):

1. After the existing calibration loop finishes (even if it didn't converge), add a **forced scaling pass**:
   - Calculate current `impliedSum`
   - Compute `scaleFactor = impliedSum / targetMid`
   - Multiply ALL multipliers by `scaleFactor`
   - Re-clamp to caps, re-snap to ladder
   - Repeat up to 12 additional iterations
   - If caps still prevent convergence, use **adaptive caps**: increase max cap by 15% per iteration (up to 25x hard ceiling)

2. After all iterations, if implied sum is still outside the band, **force it in** by scaling the unclamped athletes proportionally -- never leave a market in NEEDS_REVIEW status

3. Change the `validationStatus` logic: markets always get `VALID` status (never `NEEDS_REVIEW` which blocks play). Log warnings but don't block.

4. Store `implied_sum_actual`, `target_min`, `target_max`, `caps_used`, `iterations_used` in `market_odds` metadata for debugging

**Admin one-click repair**: Add a "Fix Multipliers" button on the Risk Dashboard that re-invokes `generate-market-odds` with `force: true` for any market with implied sum outside the band, and shows before/after implied sum

---

## Wave 2: Post-Prediction Confirmation UX

**Problem**: After placing a prediction, the user gets only a brief toast notification. No confirmation screen, no clear path to "My Predictions".

**Changes**:

### A) Confirmation screen after prediction placement
In `TournamentDetailClean.tsx`, after successful prediction:
- Instead of just a toast, navigate to `/predictions` with a `state` parameter containing the just-placed prediction details
- On the Predictions page, detect this state and show a confirmation card at top: "Saved! [athlete] [market type] [stake] tokens [potential return]" with a green checkmark

### B) "My Picks" quick link on tournament page
In `TournamentDetailClean.tsx`:
- After fetching user predictions for this tournament, show a floating "My Picks (N)" badge/link near the top that scrolls to or navigates to the user's entries for this tournament

### C) Predictions page - group by tournament
Currently `Predictions.tsx` shows a flat list. Add an optional "Group by Tournament" view:
- Use an accordion or collapsible sections
- Each tournament section shows: tournament name, total staked, total won/lost, and individual predictions

---

## Wave 3: Settlement Correctness & Results Display

**Problem**: Settlement doesn't always flip pending predictions to final statuses correctly. Finished tournaments may still show predictions as "Pending".

**Changes**:

### A) Settlement guard - prevent stale pending predictions
In `settle-predictions` edge function:
- Add an idempotency check: if a prediction is already settled (`status !== 'PENDING'`), skip it
- Already exists in the query filter (`eq('status', 'PENDING')`), but add a `settled_at` guard at the individual prediction level too
- Log all skipped predictions for debugging

### B) Tournament Results tab improvements
In `TournamentResults.tsx`:
- The component currently uses `athlete_results` table which uses `position` and `score_raw` fields
- This works for the basic display but lacks discipline-aware formatting for slalom
- Add `score_display` field usage for slalom (showing `3@41` notation instead of raw numeric)

### C) "Your Picks vs Results" improvements  
In `UserTournamentResults.tsx`:
- Currently queries predictions by `tournament_name` string match, which is fragile
- Add fallback query by `tournament_id` through the bet_slips table relationship
- Show settlement explanation inline (already partially implemented)

---

## Wave 4: Admin Visibility & Debugging

**Changes**:

### A) Market Health section on Risk Dashboard
Add to `RiskDashboard.tsx`:
- Summary cards: "X Playable / Y Blocked" markets
- For each blocked market: show reason (implied sum out of band, missing odds, etc.)
- "Fix All" button that batch-runs `generate-market-odds` for all blocked markets

### B) Live Tournament Checklist panel
Add a collapsible checklist on the Admin Dashboard for each live/upcoming tournament:
- Markets published? (count)
- Markets playable? (implied sum in band)
- Predictions placed? (count per market)
- Results entered? (per discipline/gender)
- Settlement complete?

### C) Settlement Logs section
Add to the Tournament Settlement page:
- After settlement runs, show: predictions settled count, total payout, errors encountered
- Already partially exists via `SettlementAuditTable` component

---

## What's NOT in this plan (requires separate work)

These items from the request either already work or need broader product decisions:

- **Beta token grant**: Per the memory context, the 10,000 welcome bonus was discontinued. The zero-start model is the current product direction. No change needed unless you want to re-enable it.
- **Referral system**: Already implemented (Wallet page shows referral code banner, bonuses apply on first purchase). No broken code paths found.
- **Podium save bug**: The podium flow in `TournamentDetailClean.tsx` looks functional -- selections persist in React state, the dialog blocks until saved or cancelled. If there's a specific reproduction, we can address it separately.
- **Email content matching ledger**: The `send-email` edge function is a notification layer. Ensuring email content matches ledger events requires auditing that function separately.

---

## Technical Summary

| Wave | Files Modified | Priority |
|------|---------------|----------|
| 1 | `supabase/functions/generate-market-odds/index.ts`, `src/pages/admin/RiskDashboard.tsx` | CRITICAL |
| 2 | `src/pages/TournamentDetailClean.tsx`, `src/pages/Predictions.tsx` | HIGH |
| 3 | `supabase/functions/settle-predictions/index.ts`, `src/components/TournamentResults.tsx`, `src/components/UserTournamentResults.tsx` | HIGH |
| 4 | `src/pages/admin/RiskDashboard.tsx`, `src/pages/admin/Dashboard.tsx` | MEDIUM |

Each wave can be shipped and tested independently. Wave 1 should go first as it directly unblocks users from placing predictions.

