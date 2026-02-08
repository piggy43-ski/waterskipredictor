
## What’s actually failing (why admin works but normal users don’t)
The backend is rejecting prediction placement because inserting a new bet slip triggers an audit log write that **violates a database constraint**:

- Error seen in database logs: **`new row for relation "audit_logs" violates check constraint "audit_logs_actor_type_check"`**
- `audit_logs.actor_type` is currently constrained to only allow: **`'admin'` or `'system'`**
- But the trigger on `bet_slips` writes audit logs with:
  - `'admin'` for admins
  - `'user'` for everyone else

So:
- Admin placement succeeds (`actor_type='admin'` passes)
- Normal user placement fails (`actor_type='user'` is not allowed) and the whole `bet_slips` insert rolls back, which surfaces in the UI as “Failed to place prediction”.

This impacts:
- Single predictions (uses `bet_slips`)
- Podium predictions (uses `bet_slips`)
- Parlays (uses `bet_slips`)
Fantasy entries may be unaffected unless they also touch `bet_slips`, but we’ll verify end-to-end.

---

## Implementation plan (to fully unblock normal users)

### 1) Database migration: allow `user` actor type in audit logs
Create a new database migration that updates the check constraint:

- Drop the existing constraint `audit_logs_actor_type_check`
- Re-add it to allow: **`('admin', 'system', 'user')`**

This is safe for existing rows because existing values are already within the current allowed set.

### 2) Database migration: fix the `bet_slips` audit trigger to classify “system” correctly
Update `public.audit_bet_slip_changes()` to compute actor_type like:

- If `auth.uid()` is NULL → `actor_type = 'system'`
- Else if user has admin role → `actor_type = 'admin'`
- Else → `actor_type = 'user'`

Reason: background/backend processes (service context) may not have a user id; those should not be logged as “user”.

### 3) Verification checklist (must pass before calling it fixed)
Using a non-admin test user with a funded wallet (100 tokens):

**A. Single prediction**
- Place a single prediction stake (ex: 10)
- Expect:
  - `bet_slips` row created (status PENDING)
  - `predictions` row created linked to `bet_slips`
  - wallet tokens deducted correctly
  - `token_transactions` row created (`type='bet_placed'`)
  - `audit_logs` row created with `actor_type='user'` and `action_type='CREATE'`

**B. Parlay**
- Place a parlay (ex: 10)
- Expect same as above with correct references + audit log insert success

**C. Fantasy entry**
- Join a fantasy pot
- Expect:
  - wallet deduction correct
  - `token_transactions` insert succeeds with `type='bet_placed'`
  - no hidden backend constraint failures

### 4) (Optional but strongly recommended) Improve client-side error visibility for faster debugging
Right now, some flows show generic “Failed to place prediction”.
Update catch blocks (single/podium/parlay/fantasy) to:
- `console.error('...', error)`
- show `error.message` (or Supabase error details) in the toast

This prevents “blind” debugging if another constraint/RLS issue appears during stress testing.

---

## Why this will resolve it
Your prediction placement begins by inserting into `bet_slips`. That insert triggers audit logging. For normal users, the trigger currently tries to write `actor_type='user'` into a table that forbids it, causing the insert to fail. Once the constraint and trigger logic are corrected, normal users can insert bet slips and the rest of the flow proceeds.

---

## Files/areas affected
- Database:
  - `public.audit_logs` (constraint update)
  - `public.audit_bet_slip_changes()` (trigger function update)

No UI changes are required to unblock the core issue, but optional error-message improvements are recommended for stress testing.

