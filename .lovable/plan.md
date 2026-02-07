

## Complete Overhaul of the Odds/Multiplier Engine

### Executive Summary

The current odds engine produces **implied sums of 110-157%** when the target bands are **84-92%**. This is a fundamental math error that must be fixed. The engine also has multiple probability signals (rank + rating) that conflict, causing inconsistent multiplier distributions.

---

### Root Cause Analysis

#### Problem 1: Inverted Implied Sum Math

**Current behavior:**
```
multiplier = (1/probability) × evFactor   where evFactor = 0.91
implied_sum = Σ(1/multiplier) = Σ(probability/evFactor) = 1/0.91 ≈ 1.10
```

**This is WRONG.** The formula reduces multipliers but increases implied sum above 1.0.

**Correct formula for implied_sum < 1:**
```
multiplier = 1 / (probability × targetImpliedSum)   where targetImpliedSum = 0.91
implied_sum = Σ(1/multiplier) = Σ(probability × 0.91) = 0.91 ✓
```

#### Problem 2: Conflicting Rank/Rating Signals

The engine uses BOTH:
- Weight ladder based on field rank (80% weight)
- Monte Carlo simulation based on rating (20% weight)

When rank and rating disagree, this creates non-monotonic probability distributions.

#### Problem 3: No Auto-Calibration

After clamping multipliers to caps and rounding to ladder, the implied sum drifts. There's no iterative calibration to bring it back within the target band.

---

### Technical Solution

#### A. Unified Strength Signal (Rating-Primary)

Replace the dual rank/rating system with a single "strength" score:

```typescript
function calculateStrength(athletes: Athlete[]): Map<string, number> {
  // Calculate z-scores for rating
  const ratings = athletes.map(a => a.rating);
  const meanRating = ratings.reduce((a, b) => a + b) / ratings.length;
  const stdRating = Math.sqrt(ratings.reduce((a, b) => a + Math.pow(b - meanRating, 2), 0) / ratings.length);
  
  // strength_i = rating_z + 0.15 × rank_z (small rank influence)
  return athletes.map(a => {
    const rating_z = (a.rating - meanRating) / (stdRating || 1);
    const rank_z = a.worldRank ? (10 / a.worldRank) : 0; // Inverse rank normalized
    return rating_z + 0.15 * rank_z;
  });
}
```

#### B. Softmax Probability Model

Convert strength to probability using temperature-controlled softmax:

```typescript
const TEMPERATURE = {
  WINNER: 0.85,       // Sharp favorites
  PODIUM: 1.05,       // Flatter distribution
  HIGHEST_SCORE: 1.00 // Moderate
};

function strengthToProbability(strengths: number[], marketType: string): number[] {
  const T = TEMPERATURE[marketType];
  const expScores = strengths.map(s => Math.exp(s / T));
  const sum = expScores.reduce((a, b) => a + b);
  
  // Apply floor to prevent near-zero probabilities
  const pFloor = strengths.length <= 15 ? 0.004 : 0.002;
  let probs = expScores.map(e => Math.max(e / sum, pFloor));
  
  // Re-normalize
  const probSum = probs.reduce((a, b) => a + b);
  return probs.map(p => p / probSum);
}
```

#### C. Correct Multiplier Formula

```typescript
function deriveMultipliers(probabilities: number[], targetImpliedSum: number): number[] {
  // multiplier_i = 1 / (p_i × k) where k = targetImpliedSum
  return probabilities.map(p => {
    const m = 1 / (p * targetImpliedSum);
    return m;
  });
}
```

With this formula:
```
implied_sum = Σ(1/m_i) = Σ(p_i × k) = k × Σ(p_i) = k × 1 = k ✓
```

#### D. Auto-Calibration Loop

After clamping and rounding, implied sum drifts. Fix with iterative calibration:

```typescript
function calibrateToTargetBand(
  probabilities: number[],
  marketType: string,
  caps: { min: number; max: number }
): { multipliers: number[]; impliedSum: number; iterations: number } {
  const target = TARGET_IMPLIED_SUM[marketType];
  const targetMid = (target.min + target.max) / 2;
  
  let k = targetMid;
  let multipliers: number[] = [];
  let impliedSum = 0;
  let iterations = 0;
  const maxIterations = 25;
  
  while (iterations < maxIterations) {
    // Compute multipliers
    multipliers = probabilities.map(p => {
      let m = 1 / (p * k);
      m = clamp(m, caps.min, caps.max);
      return roundToLadder(m);
    });
    
    impliedSum = multipliers.reduce((s, m) => s + (1/m), 0);
    
    // Check if within band
    if (impliedSum >= target.min && impliedSum <= target.max) {
      break;
    }
    
    // Adjust k
    if (impliedSum > target.max) {
      k *= 0.97; // Increase multipliers → lower implied sum
    } else {
      k *= 1.03; // Decrease multipliers → higher implied sum
    }
    
    iterations++;
  }
  
  return { multipliers, impliedSum, iterations };
}
```

#### E. Updated Multiplier Caps

```typescript
const MULTIPLIER_CAPS = {
  WINNER: { min: 1.8, max: 12.0 },
  PODIUM: { min: 1.6, max: 15.0 },
  HIGHEST_SCORE: { min: 2.0, max: 8.0 }, // KEY: max 8x not 12x
};

// Dynamic adjustment for large fields
function getDynamicMax(baseMax: number, fieldSize: number): number {
  if (fieldSize >= 25) return Math.min(baseMax * 1.25, 15.0);
  return baseMax;
}
```

---

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/generate-market-odds/index.ts` | Complete rewrite of probability and multiplier calculation |
| `supabase/functions/manage-probability-overrides/index.ts` | Update multiplier preview calculation |
| `supabase/functions/manage-multiplier-overrides/index.ts` | Add auto-calibration after manual overrides |
| `src/utils/multiplierUtils.ts` | Sync frontend utilities with new math |
| `src/pages/admin/MarketOddsReview.tsx` | Add "CALIBRATED" status, improve explanations |
| `src/pages/admin/ProbabilityOverrides.tsx` | Add "Fix to Target" auto-calibration button |

---

### Database Changes

Add columns to `market_odds` for auditability:

```sql
ALTER TABLE market_odds 
ADD COLUMN IF NOT EXISTS strength_score NUMERIC,
ADD COLUMN IF NOT EXISTS calibration_iterations INTEGER DEFAULT 0;
```

Create an audit view:

```sql
CREATE OR REPLACE VIEW market_odds_audit AS
SELECT 
  mo.id,
  a.name as athlete_name,
  mo.athlete_rank,
  a.current_rating_slalom as rating, -- discipline-specific
  mo.strength_score,
  mo.normalized_probability as p_i,
  mo.final_decimal_odds as multiplier,
  (1.0 / mo.final_decimal_odds) as implied_contrib,
  mo.calibration_iterations
FROM market_odds mo
JOIN athletes a ON a.id = mo.athlete_id;
```

---

### Implementation Order

1. **Phase 1: Fix the Math (Critical)**
   - Rewrite `deriveMultipliers()` with correct formula
   - Add auto-calibration loop
   - Update multiplier caps for HIGHEST_SCORE

2. **Phase 2: Unified Strength Signal**
   - Implement rating-primary strength calculation
   - Add temperature-controlled softmax
   - Remove Monte Carlo (deterministic is more auditable)

3. **Phase 3: Admin UI Updates**
   - Replace BLOCKED with CALIBRATED when auto-fixed
   - Add "Regenerate (calibrated)" action
   - Improve implied sum explanation text

4. **Phase 4: Regenerate All Markets**
   - Create admin action to regenerate all markets
   - Run for BETA TESTING tournament

---

### Expected Outcomes

After implementation:

| Market Type | Current Implied Sum | Target | Expected |
|-------------|---------------------|--------|----------|
| WINNER | 1.09-1.12 | 0.90-0.92 | 0.91 ✓ |
| PODIUM | 1.32-1.57 | 0.84-0.86 | 0.85 ✓ |
| HIGHEST_SCORE | 1.17-1.26 | 0.87-0.89 | 0.88 ✓ |

All markets will:
- Have deterministic, auditable multipliers
- Auto-calibrate to target bands
- Respect caps (max 8x for HIGHEST_SCORE)
- Show CALIBRATED status instead of BLOCKED

---

### Acceptance Test

For **slalom open_men HIGHEST_SCORE** market (11 athletes):
1. Implied sum falls between 0.87 and 0.89 ✓
2. Max multiplier ≤ 8x ✓
3. Top favorite (Smith Nate) has lowest multiplier (~3.5x) ✓
4. Monotonic ordering preserved ✓
5. No BLOCKED warning, shows CALIBRATED ✓

