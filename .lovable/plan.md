
# Launch Token Reset: Clean Economic Slate

## Overview
Reset all token balances and transaction history to start fresh for launch while preserving user accounts.

---

## What Gets Cleaned

| Table | Current State | Action |
|-------|---------------|--------|
| `token_wallets` | 7 wallets, 20,025 tokens | Reset all to 0 |
| `token_transactions` | 9 records | Delete all |
| `bet_slips` | 10 pending entries | Delete all |
| `parlay_legs` | Linked to bet_slips | Delete all |
| `market_liability` | 3 rows | Truncate |

## What Stays

| Table | Status |
|-------|--------|
| `profiles` | 7 users preserved |
| `tournaments` | All tournament data stays |
| `markets` | All markets stay |
| `selections` | All selections/multipliers stay |
| `athletes` | All athlete data stays |
| `house_bankroll_config` | $5,000 reserve stays |
| `deposit_ledger` | Clear (no real deposits yet) |

---

## Database Migration

The migration will:

1. **Delete bet_slips** (cascades to parlay_legs via FK)
2. **Delete token_transactions** (history cleared)
3. **Reset token_wallets** to 0 balance for all users
4. **Truncate market_liability** (already should be empty after bet_slips delete)
5. **Clear deposit_ledger** if any test entries exist

---

## Post-Reset State

After the reset:
- All 7 users keep their accounts (can log in)
- All users have 0 tokens
- No pending entries/predictions
- Risk Dashboard shows $0 exposure
- House bankroll: $5,000 available, $0 handle

Users will need to either:
- Purchase tokens via Stripe
- Receive welcome bonus tokens (if you want to give them)

---

## Technical Notes

- Foreign key constraints handled in correct order
- RLS policies remain unchanged
- No schema changes, only data cleanup
- Triggers remain intact for future entries

---

## Timeline

- Migration execution: ~10 seconds
- Verification queries: 1 minute
- Total downtime: None (users see 0 balance immediately)
