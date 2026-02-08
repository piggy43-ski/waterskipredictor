
## What’s actually happening (why you still see “5”)
Right now, the “All Predictions” admin page is still being filtered by the backend’s row-access rules:

- The `predictions` table currently has a rule: **users can only SELECT (view) rows where `user_id = auth.uid()`**
- There is **no admin override rule** for `predictions`
- So even though you’re an admin (you can open the admin pages), when the page queries `predictions`, the backend only returns **your account’s predictions** (in your screenshot: 5), and hides the other users’ predictions (the remaining 13)

This is why it looks like “5 are admin predictions and 13 are users” — but they’re all the same “prediction” records; you’re just only being allowed to see your own.

## Goal
Make admins able to see **all** predictions in admin screens (Dashboard counts, All Predictions list, Risk pages, House Ledger pages, etc.), while regular users still only see their own predictions.

## Implementation approach (backend security fix)
### 1) Add an admin SELECT policy on `public.predictions`
Create a new database migration that adds this rule:

```sql
-- Allow admins to view all predictions
CREATE POLICY "Admins can view all predictions"
  ON public.predictions
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
```

Notes:
- This follows the exact pattern you already use elsewhere (example: `bet_slips` has “Admins can view all bet slips”).
- It does not change what regular users can see.
- It unlocks all admin pages that currently query `predictions` without a `user_id` filter.

### 2) No frontend code changes required
Your admin UI code (like `src/pages/admin/AllPredictions.tsx` and the dashboard counts) is already written to fetch “all predictions”. It’s only being blocked by backend rules.

### 3) Verification steps (what we’ll test after applying)
1. Log in as an admin account.
2. Open **Admin → All Predictions**:
   - “Total Predictions” should change from **5** to **18**
   - The table should show predictions from multiple usernames/emails (not only your own)
3. Open **Admin Dashboard**:
   - Total predictions should match the real total (18)
   - Pending should reflect real pending count (right now your data indicates they’re all `PENDING`, so pending may equal total)
4. Hard refresh / reload once (to ensure the cached query re-runs).

## Edge cases / safety
- Emails are only shown because the admin page joins `profiles`. Your backend already has an “Admins can view all profiles” policy, so this remains secure and admin-only.
- If you later want admins to also update/settle predictions directly from the client, we can add admin UPDATE policies—but for this fix, SELECT-only is the minimum needed and safest.

## Files/areas that will change
- New SQL migration under `supabase/migrations/` (adds the admin SELECT policy for `predictions`).

