

## Critical Bug: Infinite Token Refund Exploit

### Root Cause

In `src/pages/Predictions.tsx` (line 220-293), the cancel flow does this:

1. Delete `podium_selections` 
2. Delete `predictions`
3. **Delete `bet_slips`** ← This FAILS silently due to RLS
4. **Refund tokens** ← This SUCCEEDS anyway

The RLS policies on `bet_slips` explicitly state **users cannot DELETE records**. The only cancellation path allowed by RLS is an UPDATE changing status to `'CANCELLED'`. But the code uses `.delete()`, which fails silently (no error thrown, just 0 rows affected), then proceeds to refund tokens via `increment_earned_tokens`. Since the bet slip is never actually removed, the user can repeat this indefinitely, gaining tokens each time.

### Fix

**File: `src/pages/Predictions.tsx`** — Rewrite `handleDeleteEntry` (lines 220-293):

1. **Replace delete with status update**: Use `.update({ status: 'CANCELLED' })` on `bet_slips` instead of `.delete()`, which matches the existing RLS policy "Users can cancel their own pending bet slips"
2. **Check the update actually succeeded** before refunding: Verify `data` has rows affected; if not, abort and show error
3. **Refund only after confirmed cancellation**: Move the `increment_earned_tokens` call inside the success branch
4. **Record a transaction**: Insert a `token_transactions` row with type `'bet_void'` or `'prediction_void'` for audit trail
5. **Remove the delete calls for `predictions` and `podium_selections`**: These child records should be kept for audit purposes; the `CANCELLED` status on the parent bet_slip is sufficient to mark them as void
6. **Filter out CANCELLED entries from the active list**: Update line 194 to exclude `CANCELLED` status: `s.status === 'PENDING'` already handles this, but move `CANCELLED` entries to the completed list

The corrected flow:
```
1. Check prediction window is open
2. UPDATE bet_slips SET status = 'CANCELLED' WHERE id = X AND user_id = auth.uid()
3. Verify update returned data (row was actually updated)
4. Only THEN: call increment_earned_tokens to refund
5. Record token_transaction for audit
6. Refresh entries list
```

### Secondary Issue: Edit Flow

The `handleEditEntry` function (lines 295-398) also has a non-atomic wallet update pattern and tries to update `total_stake_tokens` on bet_slips, which is blocked by the `enforce_bet_slip_immutability` trigger. This should also be reviewed, but the cancel exploit is the critical fix.

