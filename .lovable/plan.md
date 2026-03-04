

# Fix: All 72 Bet Slips Stuck as PENDING Despite Settled Predictions

## Problem
Every single bet_slip for "BETA TESTING 2" (72 entries across 20 users) is stuck at `PENDING`, even though all their child predictions have been settled to `WON` or `LOST`. This affects all users, not just yours.

## Root Cause
The `enforce_bet_slip_immutability()` database trigger blocks any status change from `PENDING` → `WON`/`LOST` unless the caller passes the admin role check:

```sql
IF OLD.status = 'PENDING' AND NEW.status NOT IN ('PENDING', 'CANCELLED') THEN
    IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
        RAISE EXCEPTION 'Only administrators can settle bet slips.';
    END IF;
END IF;
```

The settlement Edge Function uses the **service role key** to perform updates. With service role, `auth.uid()` returns `NULL`, so `has_role(NULL, 'admin')` returns `false`, and the trigger silently blocks every bet_slip update. The error is swallowed by the try/catch in the Edge Function.

## Fix (2 steps)

### Step 1: Fix the trigger to allow service role operations
Update the `enforce_bet_slip_immutability` trigger function to recognize service role context:

```sql
IF OLD.status = 'PENDING' AND NEW.status NOT IN ('PENDING', 'CANCELLED') THEN
    IF NOT (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR auth.uid() IS NULL  -- service role / backend process
    ) THEN
        RAISE EXCEPTION 'Only administrators can settle bet slips.';
    END IF;
END IF;
```

This allows the Edge Function (running as service role where `auth.uid()` is NULL) to settle bet_slips, while still blocking normal users from changing their own bet status.

### Step 2: Run a one-time data repair migration
Directly fix all 72 stuck bet_slips by deriving their correct status from their child predictions:

```sql
-- For single entries: sync status from the single prediction
-- For parlays: LOST if any leg lost, WON if all legs won/void
UPDATE bet_slips bs SET
    status = sub.derived_status,
    actual_payout_tokens = sub.derived_payout,
    settled_at = NOW()
FROM (
    SELECT 
        bs2.id,
        CASE 
            WHEN bool_or(p.status = 'LOST') THEN 'LOST'
            WHEN bool_and(p.status IN ('WON','VOID')) THEN 'WON'
            ELSE bs2.status
        END as derived_status,
        CASE
            WHEN bool_or(p.status = 'LOST') THEN 0
            WHEN bool_and(p.status IN ('WON','VOID')) THEN bs2.potential_payout_tokens
            ELSE NULL
        END as derived_payout
    FROM bet_slips bs2
    JOIN predictions p ON p.bet_slip_id = bs2.id
    WHERE bs2.status = 'PENDING'
      AND bs2.tournament_id = '8a248880-9b02-42a2-99f9-ff4682be0b2e'
    GROUP BY bs2.id, bs2.potential_payout_tokens
    HAVING bool_and(p.status != 'PENDING')
) sub
WHERE bs.id = sub.id;
```

Also credit wallets for any WON entries that never received their payout.

## Outcome
- All 72 stuck entries move to their correct WON/LOST status
- All 20 affected users see accurate results on their Predictions page
- Future settlements will work correctly because the trigger no longer blocks service role

