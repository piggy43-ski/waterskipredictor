
# Fix: Token Transaction Type Constraint Violation

## Root Cause Found
Database logs revealed the actual error:
> **"new row for relation "token_transactions" violates check constraint "token_transactions_type_check"**

The `token_transactions` table has a check constraint that only allows these types:
- `deposit`, `bet_placed`, `bet_won`, `bet_lost`, `bet_void`, `bonus`, `redemption`, `adjustment`, `burn`

But the code is using:
- `'prediction_placed'` (not allowed)
- `'fantasy_entry'` (not allowed)

**This is why it works for admins** - admins may have previously placed bets before this constraint was added, or they may be testing without logging transactions.

## Solution

### Option A: Fix the Code (Recommended - Quick Fix)
Change all transaction type values to use allowed types:
- `'prediction_placed'` → `'bet_placed'`
- `'fantasy_entry'` → `'bet_placed'` (with description indicating it's a fantasy entry)

### Option B: Update the Database Constraint
Add new types to the allowed list. However, this is riskier as it requires a migration.

**I recommend Option A** for a quick fix that unblocks your beta testers immediately.

---

## Files to Modify

### 1. `src/pages/TournamentDetailClean.tsx`
**Line 585** (Podium prediction):
```typescript
// Before
type: 'prediction_placed',

// After
type: 'bet_placed',
```

**Line 784** (Single prediction):
```typescript
// Before
type: 'prediction_placed',

// After
type: 'bet_placed',
```

### 2. `src/components/ParlayBuilder.tsx`
**Line 343** (Parlay prediction):
```typescript
// Before
type: 'prediction_placed',

// After
type: 'bet_placed',
```

### 3. `src/pages/FantasyPotDetail.tsx`
**Line 337** (Fantasy entry):
```typescript
// Before
type: 'fantasy_entry',

// After
type: 'bet_placed',
```

---

## Technical Summary
| File | Line | Change |
|------|------|--------|
| `TournamentDetailClean.tsx` | 585 | `'prediction_placed'` → `'bet_placed'` |
| `TournamentDetailClean.tsx` | 784 | `'prediction_placed'` → `'bet_placed'` |
| `ParlayBuilder.tsx` | 343 | `'prediction_placed'` → `'bet_placed'` |
| `FantasyPotDetail.tsx` | 337 | `'fantasy_entry'` → `'bet_placed'` |

After this fix, all users will be able to place predictions, parlays, and join fantasy leagues without errors.
