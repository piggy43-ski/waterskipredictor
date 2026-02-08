
# Plan: Fix Podium Multiplier Calculation

## The Problem

Currently, podium predictions show the wrong combined multiplier:

| Athlete | Multiplier |
|---------|------------|
| Nate Smith | 1.25x |
| Winter | 1.75x |
| Ross | 2.20x |
| **Current Result** | **1.44x** (broken) |
| **Expected Result** | **10.4x** |

### Root Cause
There are **two broken implementations**:

1. **PodiumPredictionDialog.tsx** (line 41):
   ```javascript
   combinedOdds = selections.reduce((acc, sel) => acc * sel.decimal_odds, 1) * 0.3
   // Result: 1.25 × 1.75 × 2.20 × 0.3 = 1.44x
   ```

2. **TournamentDetailClean.tsx** (line 438):
   ```javascript
   let combinedOdds = 1.5; // Hardcoded fallback!
   ```

---

## The Solution

### New Formula: Sum × 2

```text
Podium Multiplier = (M1 + M2 + M3) × 2

Example:
(1.25 + 1.75 + 2.20) × 2 = 5.20 × 2 = 10.4x
```

This rewards the difficulty of predicting exact podium positions by doubling the sum of individual athlete multipliers.

---

## Files to Modify

### 1. Create New Utility Function
**File:** `src/utils/podiumMultipliers.ts` (new file)

```typescript
/**
 * Calculate podium prediction multiplier
 * Formula: Sum of individual multipliers × 2
 * 
 * Rationale: Predicting exact podium positions is difficult,
 * so we reward with sum × 2 instead of product × haircut
 */
export function calculatePodiumCombinedMultiplier(
  firstMultiplier: number,
  secondMultiplier: number,
  thirdMultiplier: number
): number {
  const sum = firstMultiplier + secondMultiplier + thirdMultiplier;
  const PODIUM_BONUS_FACTOR = 2;
  return sum * PODIUM_BONUS_FACTOR;
}
```

### 2. Update PodiumPredictionDialog.tsx
**File:** `src/components/PodiumPredictionDialog.tsx`

**Before (line 41):**
```javascript
const combinedOdds = selections.reduce((acc, sel) => acc * sel.decimal_odds, 1) * 0.3;
```

**After:**
```javascript
import { calculatePodiumCombinedMultiplier } from '@/utils/podiumMultipliers';

// Sum × 2 formula for podium difficulty bonus
const combinedOdds = calculatePodiumCombinedMultiplier(
  selections[0].decimal_odds,
  selections[1].decimal_odds,
  selections[2].decimal_odds
);
```

### 3. Update TournamentDetailClean.tsx
**File:** `src/pages/TournamentDetailClean.tsx`

**Before (line 438):**
```javascript
let combinedOdds = 1.5; // Hardcoded
```

**After:**
```javascript
import { calculatePodiumCombinedMultiplier } from '@/utils/podiumMultipliers';

// Calculate actual combined multiplier using sum × 2 formula
const combinedOdds = calculatePodiumCombinedMultiplier(
  podiumState.assignedPositions.first.decimal_odds,
  podiumState.assignedPositions.second.decimal_odds,
  podiumState.assignedPositions.third.decimal_odds
);
```

### 4. Update ParlayBuilder (if applicable)
**File:** `src/components/ParlayBuilder.tsx`

Check and update the podium leg calculation to use the new formula when combining podium selections within a parlay.

---

## Expected Results After Fix

| Podium Selection | Multiplier |
|-----------------|------------|
| 🥇 Nate Smith | 1.25x |
| 🥈 Winter | 1.75x |
| 🥉 Ross | 2.20x |
| **Sum** | 5.20 |
| **× 2 Bonus** | **10.4x** |

### Example Payouts

| Stake | Multiplier | Payout |
|-------|------------|--------|
| 10 tokens | 10.4x | **104 tokens** |
| 50 tokens | 10.4x | **520 tokens** |
| 100 tokens | 10.4x | **1,040 tokens** |

---

## Validation & Caps

To prevent extreme payouts, we should add a cap:

```typescript
// Maximum podium multiplier cap (prevents bankruptcy on longshot combos)
const MAX_PODIUM_MULTIPLIER = 30; // Example: 3 longshots at 8x each = 24 × 2 = 48 → capped at 30

export function calculatePodiumCombinedMultiplier(...): number {
  const sum = firstMultiplier + secondMultiplier + thirdMultiplier;
  const raw = sum * 2;
  return Math.min(raw, MAX_PODIUM_MULTIPLIER);
}
```

---

## Summary

| Change | Before | After |
|--------|--------|-------|
| Formula | Product × 0.3 | Sum × 2 |
| Nate + Winter + Ross | 1.44x | **10.4x** |
| Display | Broken | Correct |
| Payout calculation | Wrong | Matches UI |
