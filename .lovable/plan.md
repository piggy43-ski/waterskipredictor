

## Fix: Cancel Prediction RLS Policy

**Root Cause**: Both UPDATE policies on `bet_slips` are RESTRICTIVE. Restrictive policies require ALL to pass. A non-admin user fails the admin policy, blocking the cancellation even though the user-specific cancel policy passes.

**Policies currently on `bet_slips` for UPDATE:**
1. "Admins can update all bet slips" — RESTRICTIVE — `USING: has_role(auth.uid(), 'admin')` 
2. "Users can cancel their own pending bet slips" — RESTRICTIVE — `USING: auth.uid() = user_id AND status = 'PENDING'`, `WITH CHECK: auth.uid() = user_id AND status = 'CANCELLED'`

Both are restrictive, so a regular user must pass BOTH. They fail #1 → blocked.

**Fix**: Drop both UPDATE policies and recreate them as PERMISSIVE (so ANY one passing is sufficient):

```sql
DROP POLICY "Admins can update all bet slips" ON public.bet_slips;
DROP POLICY "Users can cancel their own pending bet slips" ON public.bet_slips;

CREATE POLICY "Admins can update all bet slips"
ON public.bet_slips FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can cancel their own pending bet slips"
ON public.bet_slips FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND status = 'PENDING'::text)
WITH CHECK (auth.uid() = user_id AND status = 'CANCELLED'::text);
```

No code changes needed — the `Predictions.tsx` fix from the previous change is correct. Only the database policies need updating.

