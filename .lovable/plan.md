

# Fix: Parlay "invalid input syntax for type integer" Bug

## Problem
When a user confirms a parlay, the potential payout is calculated as `stakeAmount * multiplier` which can produce a decimal (e.g., 50 × 9.75 = 487.5). The `potential_payout_tokens` column in `bet_slips` is an integer type, so inserting 487.5 causes a Postgres error.

## Fix

### 1. Round payout to integer in ParlayBuilder.tsx
In `handleSubmit` (line 215), wrap the calculation with `Math.floor`:
```typescript
const potentialPayout = Math.floor(stakeAmount * multiplier);
```

### 2. Round payout display in renderStakeStep
In `renderStakeStep` (line 895), also floor the display value:
```typescript
const potentialPayout = Math.floor(stakeAmount * multiplierDetails.finalMultiplier);
```

### 3. Audit TournamentDetailClean.tsx for the same issue
Check all `potential_payout` and `potential_payout_tokens` calculations and apply `Math.floor` where needed (lines ~519, ~761, and related single-prediction flows).

Two files changed, no database migration needed.

