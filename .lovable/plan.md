
# Fix: Parlay Placement "Failed to place parlay" Error

## Problem
A user attempted to place a parlay with 50 tokens (from their 100 token balance) and received "Failed to place parlay" error. Investigation revealed several bugs in the parlay submission code.

## Issues Identified

### 1. Incorrect Wallet Deduction Logic (Critical)
The current code blindly sets:
```typescript
earned_tokens: walletBalance - stakeAmount
```

This is wrong because:
- `walletBalance` is the **combined total** of purchased + earned tokens
- The deduction should first come from `purchased_tokens`, then `earned_tokens`
- If user has 0 purchased + 100 earned and stakes 50, the code would set `earned_tokens = 100 - 50 = 50` which happens to be correct by accident
- But if user has 30 purchased + 70 earned (100 total) and stakes 50, it would wrongly set `earned_tokens = 50` instead of correctly deducting 30 from purchased and 20 from earned

### 2. Missing Transaction Log
The parlay placement doesn't create a `token_transactions` record, making stakes invisible in user transaction history and admin auditing.

### 3. Generic Error Messages
The catch block shows "Failed to place parlay" without specific error details, making debugging difficult.

## Solution

### File: `src/components/ParlayBuilder.tsx`

**Replace the wallet update section (lines ~305-320) with proper logic:**

1. **Fetch current wallet state** - Get actual `purchased_tokens` and `earned_tokens` values
2. **Apply correct deduction** - Deduct from purchased first, then earned (same as TournamentDetailClean.tsx)
3. **Log transaction** - Create `token_transactions` record for audit trail
4. **Improve error handling** - Log specific error messages to help with debugging

**Before (Buggy):**
```typescript
// Update wallet
const { error: walletError } = await supabase
  .from('token_wallets')
  .update({
    earned_tokens: walletBalance - stakeAmount
  })
  .eq('user_id', userId);

if (walletError) throw walletError;
```

**After (Fixed):**
```typescript
// Fetch current wallet state
const { data: walletData, error: walletFetchError } = await supabase
  .from('token_wallets')
  .select('purchased_tokens, earned_tokens')
  .eq('user_id', userId)
  .maybeSingle();

if (walletFetchError) throw walletFetchError;
if (!walletData) throw new Error('Wallet not found');

// Deduct from purchased first, then earned
const newPurchasedTokens = Math.max(0, walletData.purchased_tokens - stakeAmount);
const remaining = stakeAmount - walletData.purchased_tokens;
const newEarnedTokens = remaining > 0 
  ? walletData.earned_tokens - remaining 
  : walletData.earned_tokens;

const { error: walletUpdateError } = await supabase
  .from('token_wallets')
  .update({
    purchased_tokens: newPurchasedTokens,
    earned_tokens: Math.max(0, newEarnedTokens)
  })
  .eq('user_id', userId);

if (walletUpdateError) throw walletUpdateError;

const newBalance = newPurchasedTokens + Math.max(0, newEarnedTokens);

// Log transaction for audit trail
await supabase.from('token_transactions').insert({
  user_id: userId,
  type: 'prediction_placed',
  amount: -stakeAmount,
  balance_after: newBalance,
  reference_type: 'bet_slip',
  reference_id: betSlip.id,
  description: `Parlay entry (${completeLegs.length} legs) - ${tournament.name}`,
  metadata: {
    tournament_name: tournament.name,
    leg_count: completeLegs.length,
    multiplier: multiplier,
    potential_payout: potentialPayout,
    legs: completeLegs.map(leg => ({
      discipline: leg.discipline,
      gender: leg.gender,
      winner: leg.winner?.athlete.name
    }))
  }
});
```

**Also improve the error catch block:**
```typescript
} catch (error: any) {
  console.error('Error placing parlay:', error);
  toast.error(error.message || 'Failed to place parlay. Please try again.');
} finally {
```

## Files to Modify
- `src/components/ParlayBuilder.tsx` - Fix wallet deduction logic, add transaction logging, improve error messages

## Testing
After the fix, the user should be able to:
1. Place a parlay bet successfully
2. See the stake deduction in their transaction history
3. Receive specific error messages if something fails
