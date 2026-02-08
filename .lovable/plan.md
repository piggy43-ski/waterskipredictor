
# Comprehensive Prediction System Audit & Fix

## Summary
I audited all token deduction flows (single predictions, podium predictions, parlays, and fantasy entries) to ensure users can reliably place predictions without errors. I found **1 critical bug** that still needs fixing.

## Audit Results

### Already Fixed (Working Correctly)
| Flow | File | Status |
|------|------|--------|
| **Single Predictions** | `TournamentDetailClean.tsx` (line 755-779) | Correct deduction logic with transaction logging |
| **Podium Predictions** | `TournamentDetailClean.tsx` (line 556-604) | Correct deduction logic with transaction logging |
| **Parlay Predictions** | `ParlayBuilder.tsx` (line 311-360) | Fixed in last commit - correct deduction with transaction logging |

These flows all correctly:
1. Fetch current `purchased_tokens` and `earned_tokens` separately
2. Deduct from `purchased_tokens` first, then `earned_tokens`
3. Log the transaction in `token_transactions`

---

### Bug Found: Fantasy Entry Fee Deduction

**File:** `src/pages/FantasyPotDetail.tsx` (lines 272-283)

**Problem:** The fantasy entry submission uses the **same incorrect pattern** the parlay had:
```typescript
// BUGGY CODE:
const newBalance = walletBalance - pot.entry_fee_tokens;
const { error: walletError } = await supabase
  .from('token_wallets')
  .update({ 
    earned_tokens: newBalance,  // WRONG: walletBalance is combined total!
    updated_at: new Date().toISOString()
  })
  .eq('user_id', user.id);
```

**Issues:**
1. `walletBalance` is the **combined** purchased + earned total
2. It blindly sets `earned_tokens` to the new balance, which is wrong
3. If user has 50 purchased + 50 earned (100 total) and pays 30 entry fee:
   - Code sets `earned_tokens = 100 - 30 = 70`
   - But `purchased_tokens` remains at 50
   - Result: User now has 50 + 70 = **120 tokens** (they gained tokens!)

**Impact:** Users could gain tokens when joining fantasy leagues, or the update could fail with constraint violations.

---

## The Fix

### File: `src/pages/FantasyPotDetail.tsx`

Replace the wallet deduction section (lines 272-283) with correct accounting:

```typescript
// Fetch current wallet state
const { data: walletData, error: walletFetchError } = await supabase
  .from('token_wallets')
  .select('purchased_tokens, earned_tokens')
  .eq('user_id', user.id)
  .maybeSingle();

if (walletFetchError) throw walletFetchError;
if (!walletData) throw new Error('Wallet not found');

// Deduct from purchased first, then earned (correct accounting)
const entryFee = pot.entry_fee_tokens;
const newPurchasedTokens = Math.max(0, walletData.purchased_tokens - entryFee);
const remaining = entryFee - walletData.purchased_tokens;
const newEarnedTokens = remaining > 0 
  ? walletData.earned_tokens - remaining 
  : walletData.earned_tokens;

const { error: walletError } = await supabase
  .from('token_wallets')
  .update({
    purchased_tokens: newPurchasedTokens,
    earned_tokens: Math.max(0, newEarnedTokens)
  })
  .eq('user_id', user.id);

if (walletError) throw walletError;

const newBalance = newPurchasedTokens + Math.max(0, newEarnedTokens);
```

Also update the transaction logging to use the correct `newBalance`:
```typescript
// Log transaction (already exists but needs correct balance)
await supabase
  .from('token_transactions')
  .insert({
    user_id: user.id,
    type: 'fantasy_entry',
    amount: -pot.entry_fee_tokens,
    balance_after: newBalance,  // Use calculated balance, not walletBalance - fee
    description: `Fantasy entry: ${pot.name}`,
    reference_id: entryData.id,
    reference_type: 'fantasy_entry',
    metadata: {
      pot_name: pot.name,
      team_name: teamName || 'My Team',
      roster_size: roster.length,
      team_value: usedBudget
    }
  });
```

---

## Files to Modify
- `src/pages/FantasyPotDetail.tsx` - Fix wallet deduction logic (lines 272-283)

## Testing Checklist
After the fix, users should be able to:
1. Place single predictions on tournaments
2. Place podium predictions (3-athlete combos)
3. Place parlay predictions (multi-leg combos)
4. Join fantasy leagues with entry fees
5. See all stakes deducted correctly in their transaction history
6. Have correct token accounting (purchased depletes before earned)
