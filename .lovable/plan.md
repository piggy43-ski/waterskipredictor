

# Fix: Settlement Preview Summary Issues

## Problems Identified

### 1. No "Correct Predictions" count
The preview only shows total predictions and total payout per market. You can't tell how many predictions were correct (won) vs incorrect (lost). This makes it hard to verify the settlement is right before confirming.

### 2. Payout shows 0 for parlay bets
The payout calculation (line 848) uses `prediction.potential_payout`, which is stored as `0` for parlay legs. The actual payout lives on the `bet_slips` table. So parlay payouts are silently missing from the summary totals.

### 3. HIGHEST_SCORE winner may be wrong
The highest score logic scans all rounds (qual/semi/final) by reading from the in-memory `results` state. If qual or semi results were not loaded into state (e.g., only finals were entered this session), it only compares final round scores and may pick the wrong athlete.

---

## Changes

### File: `src/pages/admin/TournamentSettlement.tsx`

**A) Add won/lost counts to `SettlementPreview` type and UI**

Add two fields to the type:
- `won_count: number` (predictions that matched the winner)
- `lost_count: number` (predictions that didn't)

Populate them from the existing `winningPredictionIds` and `losingPredictionIds` arrays (which are already computed). Display them in the preview card grid so each market shows "3 Won / 7 Lost" style breakdown.

**B) Fix parlay payout calculation**

After collecting winning prediction IDs, query `bet_slips` to find any parlay slips where all legs are in the winning set. Add their `total_stake_tokens * total_odds_decimal` to the payout total. For single bets, keep using `potential_payout` as-is.

Specifically:
- Query `bet_slips` joined with `predictions` for the affected selection IDs
- For parlays (`leg_count > 1`): only count the payout if ALL legs of that slip are winning
- For singles: use the existing `potential_payout` from the prediction

**C) Fix HIGHEST_SCORE: load saved results from DB**

Before scanning in-memory `results`, also query `tournament_results` from the database for qual/semi rounds. This ensures that even if only finals were entered in the current session, previously saved qual/semi scores are included in the highest-score determination.

**D) Improve the per-market preview card UI**

Update the 3-column grid to a 4-column grid:
- Predictions (total count)
- Won (green, count of correct predictions)  
- Lost (red, count of incorrect predictions)
- Payout (total payout amount)

This gives you clear visibility into exactly how many predictions are correct before you confirm settlement.

### Files Modified
- `src/pages/admin/TournamentSettlement.tsx` (type, calculation logic, UI)
