

# Enhanced All Transactions Page - Purchase Detail View

## Problem Identified
The current All Transactions page only displays records from `token_transactions`, which primarily contains bonus entries. It's missing:
1. **Actual purchase transactions** - The purchase events themselves (stored in `deposit_ledger`)
2. **Referral details** - Who referred the buyer, which code was used, bonus percentages
3. **Complete audit trail** - USD spent, pack purchased, effective discounts

When Samson Clunie bought $25 (Starter pack), you only see the 100-token beta bonus, not his actual purchase of 2500 tokens.

## Solution
Enhance the All Transactions page with a new "Purchases" filter/section that pulls from `deposit_ledger` and joins with referral data to show complete purchase history with all details.

## Data Sources to Join

| Table | Data |
|-------|------|
| `deposit_ledger` | USD amount, tokens received, Stripe ID, timestamp |
| `referral_redemptions` | Bonus tokens, referral code used, referrer, commission rates |
| `referral_codes` | Code name (e.g., "BALLER"), code owner |
| `profiles` | User info + `referred_by_code_id` for non-first purchases |

## Implementation

### File: `src/pages/admin/AllTransactions.tsx`

**Changes:**
1. Add a new transaction type filter option: `'purchase'` in addition to existing types
2. Create a separate query to fetch from `deposit_ledger` when "purchase" filter is selected
3. Join with `referral_redemptions` and `referral_codes` to get full referral details
4. Display enhanced columns for purchase rows:
   - User (username + email)
   - Pack Name (Starter/Standard/Pro/Elite)
   - USD Amount ($25, $50, etc.)
   - Base Tokens (what pack normally gives)
   - Bonus Tokens (from referral)
   - Total Tokens (base + bonus)
   - Referral Code Used (if any)
   - Referrer (who gets commission, if anyone)
   - Commission Rate (%)
   - Date

**Query logic for purchases:**
```typescript
// Fetch deposit_ledger with referral data
const { data: deposits } = await supabase
  .from('deposit_ledger')
  .select('*')
  .eq('transaction_type', 'deposit')
  .order('created_at', { ascending: false });

// Get all referral redemptions to match by purchase_id (stripe_payment_intent_id)
const { data: redemptions } = await supabase
  .from('referral_redemptions')
  .select('*, referral_codes(code, owner_user_id)')
  .in('purchase_id', deposits.map(d => d.stripe_payment_intent_id));

// Get profiles for user info and referrer info
const { data: profiles } = await supabase
  .from('profiles')
  .select('id, username, email');

// Merge all data together
```

**Enhanced purchase row display:**

For each purchase, show:
- **Date**: Feb 6, 2026 10:13 PM
- **User**: Samson Clunie (samsonclunie@icloud.com)
- **Pack**: Starter
- **USD**: $25.00
- **Base Tokens**: 2,500
- **Bonus**: +0 (no referral used)
- **Total**: 2,500
- **Referral**: None
- **Referrer**: —

For a user with referral:
- **Date**: Feb 5, 2026 10:04 PM  
- **User**: Travis Anderson (travis...)
- **Pack**: Standard
- **USD**: $50.00
- **Base Tokens**: 5,000
- **Bonus**: +2,500 (50% via BALLER)
- **Total**: 7,500 (includes base discount)
- **Referral**: BALLER
- **Referrer**: — (no owner set)
- **Commission**: 22% ($11 value)

### UI Updates

1. **Filter Panel**: Add "purchase" to the type dropdown alongside existing types
2. **Table Columns**: When viewing purchases, show the enhanced columns above
3. **Summary Cards**: Update stats when "purchase" filter is active:
   - Total Revenue (USD)
   - Tokens Sold
   - Bonus Tokens Awarded
   - Referrals Used

4. **Row Styling**: 
   - Show referral bonus in green if present
   - Show referral code as a badge
   - Show commission details on hover/tooltip

### Technical Notes

- The `deposit_ledger` uses `stripe_payment_intent_id` which matches `purchase_id` in `referral_redemptions`
- `referral_redemptions` stores snapshot values at time of purchase (audit-safe)
- For purchases without referrals, simply show the base transaction without bonus columns filled

