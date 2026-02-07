

## Fix Multiplier Calculation & Missing Athletes

### Overview

Two critical issues are causing bankruptcy risk and missing athletes:

1. **María Delfina Cuglievan Wiese excluded from Women's Trick** - The specialist filter is too strict
2. **ALL markets have inverted house edge math** - Implied sums are >1 instead of <1, meaning multipliers are too high

---

### Technical Details

#### Issue 1: Specialist Filter Too Strict

**Current Filter (lines 426-431):**
```typescript
const hasMeaningfulRating = (entryRating && entryRating > 70) || ...
```

**Problem:** María Delfina has `rating_0_100 = 70` exactly, which fails the `> 70` check.

**Fix:** Change to `>= 70` to include athletes with default ratings who have been explicitly entered.

---

#### Issue 2: House Edge Math is Inverted

**Current Reality:**
| Market Type | Current Implied Sum | Target |
|------------|---------------------|--------|
| WINNER | 1.09-1.11 | 0.90-0.92 |
| HIGHEST_SCORE | 1.12-1.26 | 0.87-0.89 |
| PODIUM | 1.32-1.57 | 0.84-0.86 |

**Problem:** The `deriveMultipliers()` function calculates:
```typescript
m = (1/p) * evFactor  // where evFactor = 0.91
```

This REDUCES multipliers, but then implied_sum = Σ(1/m) = Σ(p/0.91) = 1/0.91 ≈ 1.10 > 1

**Mathematical Fix:**

For sportsbook-style house edge:
- implied_sum > 1 = overround = house edge
- BUT our system uses multipliers as "how much you win per token"

The correct interpretation for our prediction game:
- We want implied_sum < 1 to ensure house profitability
- Formula should be: `multiplier = (1/p) × target_implied_sum`
- Where target_implied_sum = 0.91 for WINNER markets

**Current formula effect:**
```
p = 0.30 (30% win probability)
m = (1/0.30) × 0.91 = 3.03
EV = p × m = 0.30 × 3.03 = 0.91 ✓ (player gets 91 cents per dollar)
implied_sum contribution = 1/3.03 = 0.33
```

Wait - this is actually CORRECT! Let me recalculate...

**Rechecking the math for Women's Trick WINNER:**
- Lang Erika: 3.0x, contribution = 1/3.0 = 0.333
- Ross Neilly: 4.6x, contribution = 1/4.6 = 0.217
- Hunter Anna: 7.0x, contribution = 1/7.0 = 0.143
- Bonnemann: 10.5x = 0.095
- Hansen: 11.5x = 0.087
- Rini: 12.5x = 0.080
- Verswyvel: 13x = 0.077
- Straltsova: 13.5x = 0.074

Sum = 1.107 ✓ (matches database)

**The ACTUAL Problem:**
The implied_sum > 1 IS the house edge in sportsbook terms! But the code comments suggest we want implied_sum < 1.

Looking at TARGET_EV_FACTOR bands (lines 18-22):
```typescript
const TARGET_EV_FACTOR = {
  WINNER: { min: 0.90, max: 0.92 },       // 8-10% house edge
  PODIUM: { min: 0.84, max: 0.86 },       // 14-16% house edge  
  HIGHEST_SCORE: { min: 0.87, max: 0.89 }, // 11-13% house edge
};
```

These are CORRECT! Player EV = 0.91 means house keeps 9%.

**The real confusion:** The memory entry says "implied_sum < 1.0 metric which was mathematically inverted" but the current implied_sum ~1.10 for WINNER markets IS correct for 9% house edge.

**Validation:**
- Player bets 100 tokens on Lang Erika (3.0x)
- Win probability: ~30%
- Expected return: 0.30 × 300 = 90 tokens
- EV = 0.90 → House edge = 10% ✓

**CONCLUSION: The math is actually CORRECT!**

The UI showing "0 athletes" in Women's Trick is the real issue - the Probability Editor isn't loading data.

---

### What Needs Fixing

#### 1. Specialist Filter: Include seed_rank=1 athletes
```typescript
// Change line 429 from:
const hasMeaningfulRating = (entryRating && entryRating > 70) || ...

// To:
const hasMeaningfulRating = (entryRating && entryRating >= 70) || ...
// OR better: check if seed_rank exists
const hasSeedRank = e.seed_rank !== null && e.seed_rank !== undefined;
```

#### 2. Probability Editor: Fix query to load market_odds data

The Probability Editor showing "0 athletes" is a **frontend issue**, not a data issue. The market_odds table HAS 8 records for Women's Trick but the UI isn't displaying them.

---

### Implementation Steps

1. **Update `generate-market-odds` edge function:**
   - Relax specialist filter to include athletes with seed_rank OR rating >= 70
   - This will include María Delfina Cuglievan Wiese

2. **Re-generate odds for Women's Trick markets:**
   - Deploy updated function
   - Trigger regeneration for the 3 Women's Trick markets

3. **Debug Probability Editor UI (if still showing 0):**
   - Check the query in admin pages that loads market_odds
   - Verify filters match the market being viewed

---

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/generate-market-odds/index.ts` | Relax specialist filter (line 429) |

### Expected Outcome

- Women's Trick markets will have 9 athletes instead of 8
- María Delfina included with appropriate multiplier
- Probability Editor will show all athletes
- House edge remains at safe levels (8-10% for WINNER)

