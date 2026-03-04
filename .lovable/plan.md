

## Plan: Referral Admin Enhancements + BALLER Assignment + Transaction Labels

### 1. Assign BALLER code owner (data operation)
Update `referral_codes` table to set `owner_user_id = '5ba913f1-8fb8-4932-a9b4-4a41f4d6d82a'` for the BALLER code.

### 2. Add Owner User ID field to create/edit dialog (`Referrals.tsx`)
- Add a `formOwnerUserId` state field
- Add an input in the dialog form labeled "Owner User ID" where admin can paste a UUID
- Include it in `handleSubmit` so it gets saved as `owner_user_id` on create and update
- Pre-populate when editing an existing code
- Show the owner username/email next to codes in the table (already partially done via the `owner` join)

### 3. Add Delete button to referral codes table (`Referrals.tsx`)
- Add a `deleteCodeMutation` that calls `supabase.from('referral_codes').delete().eq('id', id)`
- Add a Trash icon button in each table row next to the Edit button
- Wrap in a confirmation dialog (AlertDialog) to prevent accidental deletion

### 4. Improve transaction labels for referral bonuses (`Transactions.tsx`)
- Add `reference_type` to the Transaction interface (it exists in the DB but isn't selected)
- Update the `fetchTransactions` query to include `reference_type`
- In `getTypeBadge`, detect when `type === 'bonus'` AND `reference_type === 'referral'` → show "Referral Bonus" badge
- When `reference_type === 'referral_reward'` → show "Referral Commission" badge
- Add corresponding icons and filter options

### 5. Stripe webhook already fixed
The formula fix from the previous message is deployed. The `description` field in `token_transactions` already includes the referral code name (e.g., "Referral bonus (BALLER) - +75% on Pro pack"), so existing descriptions are clear. The badge enhancement makes it even more visible.

### Files to modify
- `src/pages/admin/Referrals.tsx` — add owner_user_id field, delete button with confirmation
- `src/pages/Transactions.tsx` — add referral-specific badge labels, select `reference_type`
- Data update: set BALLER `owner_user_id`

