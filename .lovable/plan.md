

# Fix: Correct BETA TESTING Settlement + Rebrand "Bet Slips" to "Predictions"

## Part 1: Fix Incorrect Settlement Data

### Problem
The **WINNER slalom open_men** market was incorrectly settled — **Ross Charlie** was marked as WON, but the actual winner was **Nate Smith** (won on tiebreak). Ross Charlie should be LOST for the WINNER market.

- 9 predictions on "Ross Charlie to win" are incorrectly WON
- 8 of those have non-zero payouts totaling **1,413 tokens** that were incorrectly credited
- 1 prediction (staked 200, payout 0) was marked WON but never paid -- likely a bug in payout calculation

The HIGHEST_SCORE slalom market is correct: Nate Smith is WON. Nobody predicted Ross Charlie for highest score, so no change needed there (even though they shared the score).

### Additionally: 3 orphan bet_slips
3 bet_slips exist with **no linked predictions** (orphans from early bugs). They need to be voided.

### SQL Migration

```sql
-- 1. Flip Ross Charlie WINNER predictions from WON to LOST
UPDATE predictions
SET status = 'LOST', payout_tokens = 0, settled_at = now()
WHERE selection_id = '0febde69-2dbe-4e41-8f0c-86963052e8cc'
  AND status = 'WON';

-- 2. Claw back incorrectly paid tokens from user wallets
-- (One UPDATE per user with non-zero payouts)
-- User 2e5f... : -300
-- User 5b9f... : -90
-- User b992... : -30
-- User 5ba9... : -750
-- User 1d55... : -150
-- User 5f88... : -30
-- User 4523... : -30
-- User d731... : -33

-- 3. Update parent bet_slips for Ross Charlie WINNER
-- (derive new status from child predictions)

-- 4. Void 3 orphan bet_slips with no predictions
UPDATE bet_slips SET status = 'VOID', settled_at = now()
WHERE id IN ('8605912b-...', '16f832f2-...', '417d46e9-...');
```

The migration will:
- Disable the immutability trigger temporarily
- Flip 9 Ross Charlie WINNER predictions to LOST with payout_tokens = 0
- Deduct incorrectly credited tokens from each affected user's wallet (total: 1,413 tokens)
- Re-derive the parent bet_slip statuses
- Void the 3 orphan bet_slips
- Re-enable the trigger

## Part 2: Rebrand "Bet Slips" to "Predictions" in Code

The `Predictions.tsx` page and related components still use `BetSlip` interface names and `betSlip` variable names internally. While the database table is still called `bet_slips` (renaming a table is risky on a live app), all **user-facing** references and **code-level** naming should use "prediction" / "entry" terminology.

### Changes in `src/pages/Predictions.tsx`:
- Rename `BetSlip` interface to `PredictionEntry`
- Rename `activeBetSlips` / `completedBetSlips` state variables to `activeEntries` / `completedEntries`
- Rename `fetchBetSlips()` to `fetchEntries()`
- Rename `EntrySlipCard` to `EntryCard`
- Update all internal comments from "bet slip" to "prediction entry"
- Ensure no user-facing text says "bet" or "slip"

### Files to modify

| File | Change |
|------|--------|
| Database (migration) | Fix Ross Charlie settlement, claw back tokens, void orphans |
| `src/pages/Predictions.tsx` | Rebrand BetSlip to PredictionEntry throughout |

