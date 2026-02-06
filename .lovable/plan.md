

## Fix Token Purchase Amount & Bonus Calculation

### Problems Identified

**1. USD Amount Calculated Wrong**
The `deposit_ledger` shows:
- Standard pack: **$55** instead of **$50**
- Pro pack: **$115** instead of **$100**

**Cause**: Line 377 of `stripe-webhook/index.ts` calculates:
```typescript
const depositAmountUsd = baseTokens * 0.01;
```

But `baseTokens` from metadata contains the **token amount WITH bonus already included** (5,500 instead of 5,000), because that's what `Wallet.tsx` passes.

---

**2. Bonus Description Shows Wrong Percentage**
Transaction logs show "+50% on first purchase" for both purchases, but Pro pack should show "+75%".

**Cause**: These purchases were made before the per-pack percentage code was fully deployed. The current code (line 176) does correctly show per-pack percentages for new purchases.

---

**3. BALLER Code Percentages Are Correct**
Verified in database:
- starter_bonus_pct: **0.15** (15%) ✅
- standard_bonus_pct: **0.50** (50%) ✅  
- pro_bonus_pct: **0.75** (75%) ✅
- elite_bonus_pct: **1.00** (100%) ✅

---

### Root Cause Summary

| Issue | Location | Problem |
|-------|----------|---------|
| Wrong USD | `stripe-webhook` line 377 | Uses `baseTokens` (post-bonus) × 0.01 instead of actual Stripe charge |
| Wrong base_tokens metadata | `Wallet.tsx` line 123 | Passes `pack.baseTokens` but this is correct - the issue is how webhook reads it |

Actually, looking closer at `Wallet.tsx` line 123:
```typescript
baseTokens: pack.baseTokens, // Pass base tokens for accurate USD calculation
```

It IS passing `pack.baseTokens` (e.g., 5000 for Standard), but the issue is that `tokenAmount` on line 121 is set to `pack.tokens` which INCLUDES the bonus (e.g., 5500).

Then in the webhook (line 304):
```typescript
const baseTokens = parseInt(session.metadata?.base_tokens || session.metadata?.token_amount || "0", 10);
```

This should use `base_tokens` correctly (5000), but the USD calc still shows $55...

Let me check: if `baseTokens = 5000`, then `5000 * 0.01 = $50`. So the math should be right...

Wait! Looking at the data again:
- Standard: `tokens_amount: 5500`, `amount_usd: 55`
- Pro: `tokens_amount: 11500`, `amount_usd: 115`

The amounts are `tokens_amount * 0.01`! That means the webhook is reading `token_amount` (5500) into `baseTokens` instead of `base_tokens` (5000).

The fallback on line 304 kicks in if `base_tokens` metadata is missing:
```typescript
const baseTokens = parseInt(session.metadata?.base_tokens || session.metadata?.token_amount || "0", 10);
```

Either `base_tokens` wasn't being sent, OR the webhook code was an older version that didn't have it yet.

---

### Fix Required

#### 1. Fix USD Calculation in stripe-webhook
Use Stripe's actual charge amount instead of calculating from tokens:

```typescript
// Line 377 - Use actual Stripe charge amount
const depositAmountUsd = (session.amount_total || 0) / 100;
```

This is the most reliable method because it reflects exactly what Stripe charged.

#### 2. Fix Existing Records (Manual SQL)
Run this in your database to correct the 3 existing purchases:

```sql
-- Fix USD amounts
UPDATE deposit_ledger SET amount_usd = 25 
WHERE stripe_payment_intent_id = 'pi_3SwpLgCpRLHrrx2G19IT3EDV';

UPDATE deposit_ledger SET amount_usd = 50 
WHERE stripe_payment_intent_id = 'pi_3SxaeZCpRLHrrx2G1POjVx5E';

UPDATE deposit_ledger SET amount_usd = 100 
WHERE stripe_payment_intent_id = 'pi_3SxABRCpRLHrrx2G0yI5FnhO';

-- Fix referral_redemptions
UPDATE referral_redemptions 
SET purchase_amount_usd = 50, pack_name = 'Standard', base_discount_pct = 0.05, 
    referral_discount_pct = 0.50, effective_discount_pct = 0.50
WHERE purchase_id = 'pi_3SxaeZCpRLHrrx2G1POjVx5E';

UPDATE referral_redemptions 
SET purchase_amount_usd = 100, pack_name = 'Pro', base_discount_pct = 0.10, 
    referral_discount_pct = 0.75, effective_discount_pct = 0.75
WHERE purchase_id = 'pi_3SxABRCpRLHrrx2G0yI5FnhO';
```

---

### Files to Modify

**`supabase/functions/stripe-webhook/index.ts`**
- Line 377: Change USD calculation to use `session.amount_total / 100`

---

### Summary of Current Bonus Logic (Correct)

| Pack | Base Discount (no referral) | BALLER Referral |
|------|----------------------------|-----------------|
| Starter | 0% | +15% |
| Standard | +5% | +50% |
| Pro | +10% | +75% |
| Elite | +15% | +100% |

The Wallet.tsx and stripe-webhook code correctly apply these percentages. The issues were:
1. Historical purchases before full implementation
2. USD calculation using wrong token count

