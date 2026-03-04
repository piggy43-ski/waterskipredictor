

# Fix: Admin Probability Editor Shows Wrong Multipliers

## The Problem

The admin Probability Editor shows **4.14x** for Lang Erika, but users see **1.50x**. Both values come from the database — the 1.50x is the actual calibrated multiplier stored in `selections.decimal_odds` and `market_odds.final_decimal_odds`. The 4.14x is a **recalculated** value from the Probability Editor's own formula: `1 / (probability × 0.91)`.

### Why the Mismatch

The pricing engine (`generate-market-odds`) uses a sophisticated calibration loop with rank caps, monotonicity enforcement, temperature tuning, and forced convergence to produce multipliers that hit a target implied sum band. The admin Probability Editor uses a naive formula `1 / (prob × 0.91)` that ignores all of these constraints.

Line 198 in `ProbabilityEditor.tsx` tries to use the real value first:
```typescript
const multiplier = selectionsMap.get(o.athlete_id) || calculateMultiplier(p_winner);
```
But `selectionsMap` is often empty due to query timing (it depends on `markets` being loaded first), so it falls back to the wrong formula. The implied sum calculation (line 219-222) always uses the formula, never the real values.

### Impact
- Admin sees 4.14x and 101.3% implied sum → thinks pricing is broken
- Users see 1.50x → the actual correct calibrated value
- Admin decisions based on the editor are misinformed

## Fix Plan

### File: `src/components/admin/ProbabilityEditor.tsx`

**1. Use `final_decimal_odds` from `market_odds` as primary multiplier source**

Instead of relying on a separate `selections` query that has timing issues, read the multiplier directly from the `market_odds` data (already fetched via `allOdds`). The `market_odds.final_decimal_odds` IS the calibrated multiplier.

In the athlete mapping (line 193-216):
```typescript
const multiplier = o.final_decimal_odds || selectionsMap.get(o.athlete_id) || calculateMultiplier(p_winner);
```
Priority: `final_decimal_odds` (calibrated) → `selections.decimal_odds` (fallback) → formula (last resort).

**2. Fix implied sum to use actual multipliers**

Change lines 219-222 to use the athlete's stored multiplier instead of recalculating:
```typescript
const impliedSum = athletes.reduce((sum, a) => {
  return sum + (1 / a.multiplier);
}, 0);
```

**3. Add "Actual vs Formula" indicator**

Show both values in the Mult column when they differ significantly (>10% gap), so the admin understands the calibration effect:
- Primary: actual calibrated multiplier (bold)
- Secondary: formula-derived value (small, muted, with tooltip explaining it's the raw probability-based estimate)

### Expected Outcome
- Admin sees the same 1.50x that users see
- Implied sum reflects the real calibrated odds (~90-92%)
- No more confusion between formula estimates and actual pricing

