

## Bug Analysis: Creator Reward Calculation

### Root Cause

The `stripe-webhook` edge function calculates creator rewards **on USD spent**, then converts back to tokens — instead of directly computing **% of purchased tokens**.

**Current flow (broken):**
```text
Line 140: referrerRewardValue = purchaseAmountUsd × referrer_reward_pct
           $55 × 0.20 = $11.00   (USD, not tokens!)

Line 215: referrerTokens = floor($11.00 × 100) = 1,100 tokens
```

But the intent of "20% tokens" is:
```text
7,500 tokens × 0.20 = 1,500 tokens
17,500 tokens × 0.20 = 3,500 tokens
```

The existing redemption records show `referrer_reward_value: 11` and `23` — these are USD values, not token counts. The creator was credited 1,100 and 2,300 tokens instead of the correct 1,500 and 3,500.

### Second Bug: `owner_user_id` is NULL

All three referral codes (`BALLER`, `HANNAH`, `KENNA`) have `owner_user_id = NULL`. This causes "Creator: Unknown" in the admin UI and means the auto-credit logic on line 213 (`if referralCode.owner_user_id`) is **skipped** — so no tokens were actually credited to anyone anyway. The redemption records exist but the wallet credits never happened.

Found matching users:
- `HANNAH` → `hannahstopnicki` (id: `5b9f6c93...`)
- `KENNA` → `Kenna` (id: `ba5f8c47...`)
- `BALLER` → needs manual identification

### Fix Plan

#### 1. Fix the formula in `stripe-webhook/index.ts`

Replace the USD-based calculation with a direct token percentage:

```typescript
// OLD (broken):
const referrerRewardValue = purchaseAmountUsd * referralCode.referrer_reward_pct;
// ...
const referrerTokens = Math.floor(referrerRewardValue * 100);

// NEW (correct):
const referrerTokens = Math.round(baseTokens * referralCode.referrer_reward_pct);
const referrerRewardValue = referrerTokens; // store as tokens directly
```

Also add a `pctToDecimal` safety helper to handle if someone stores 20 instead of 0.20.

#### 2. Update `owner_user_id` on referral codes

Set the correct owner for HANNAH and KENNA. BALLER needs you to tell me which user owns it.

#### 3. Backfill existing redemption records

- Recalculate `referrer_reward_value` as `round(purchase_amount_tokens × commission_rate)` for each existing redemption
- Credit the correct token difference to each creator's wallet (if owner is set)
- Log corrective `token_transactions`

#### 4. Update the redemption record schema

Change the `referrer_reward_value` column semantics to store token count (not USD). Update the admin Referrals page display accordingly.

### Questions Before Implementing

I need to know:
- **Who owns the BALLER code?** (Which user should receive the creator rewards?)

