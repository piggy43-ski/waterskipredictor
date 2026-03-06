

## Plan: Backfill BALLER Rewards + "Pay Now" Button for Creator Credits

### 1. Data Operations (via insert tool)

**Assign BALLER owner:**
```sql
UPDATE referral_codes SET owner_user_id = '5ba913f1-8fb8-4932-a9b4-4a41f4d6d82a' WHERE code = 'BALLER';
```

**Backfill BALLER redemption records** — recalculate `referrer_reward_value` to correct token amounts (20% of `purchase_amount_tokens`) and set `referrer_user_id` to BallOfSpray's ID.

**Credit BallOfSpray's wallet** — add the total owed tokens to `earned_tokens` in `token_wallets`, create `token_transactions` entries with `reference_type = 'referral_reward'`, and mark the redemptions as paid (`referrer_paid_at`).

### 2. Enhance "Mark Paid" → "Credit & Pay" (Referrals.tsx)

The current "Mark Paid" button only timestamps `referrer_paid_at` — it does NOT actually credit tokens to the creator's wallet. This needs to change:

**Replace `markPaidMutation`** with a new mutation that:
1. Looks up the redemption's `referrer_user_id` and `referrer_reward_value`
2. Calls `supabase.rpc('increment_earned_tokens', { user_id_param, amount })` to credit the wallet
3. Inserts a `token_transactions` record (type: `bonus`, reference_type: `referral_reward`)
4. Updates `referrer_paid_at` on the redemption

**Add visual status indicators** to the redemptions table:
- Green "Credited" badge when `referrer_paid_at` is set
- Red "Unpaid" badge when null
- Show this in both the Activity tab and Payouts tab

### 3. Fix display of reward values

Currently showing `referrer_reward_value.toFixed(2)` — since values are now token integers (e.g., 1500, 3500), change display to whole numbers without decimals for token type.

### Files to modify
- `src/pages/admin/Referrals.tsx` — update Mark Paid to actually credit tokens, add status badges, fix number formatting
- Data operations — assign BALLER owner, backfill rewards, credit wallet

