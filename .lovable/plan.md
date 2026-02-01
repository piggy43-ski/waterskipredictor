

# Pre-Launch Critical Fixes: House Edge Math + Market Liability

## Executive Summary

We've identified **two launch-blocking issues** that must be fixed before tomorrow's launch:

1. **Inverted House Edge** - The multiplier formula gives players +EV instead of house edge
2. **Stale Market Liability** - Risk dashboard uses old test data, not current pending entries

Both are fixable tonight with surgical changes.

---

## Issue 1: House Edge Math is Inverted

### The Bug (in plain terms)

When calculating multipliers, the code currently does:
```text
multiplier = 1 / (probability × 0.91)
```

This produces **higher** multipliers than fair odds, giving players a 10% advantage. We need the **opposite** - multipliers that are ~10% lower than fair.

### The Math

**Current (wrong):**
```text
p_adj = p × 0.91
mult = 1 / p_adj = 1 / (p × 0.91)

For p = 0.20 (20% chance):
  mult = 1 / (0.20 × 0.91) = 5.49x
  EV = 0.20 × 5.49 = 1.098 → Player wins 9.8%
```

**Correct (house wins):**
```text
mult = (1/p) × 0.91

For p = 0.20 (20% chance):
  mult = (1/0.20) × 0.91 = 4.55x
  EV = 0.20 × 4.55 = 0.91 → House keeps 9%
```

### File Changes

**File: `supabase/functions/generate-market-odds/index.ts`**

Lines 309-323 - Update the `deriveMultipliers` function:

```typescript
// CURRENT (WRONG):
const edgeFactor = targetMid;  // 0.91
const multipliers = p_final.map(p => {
  const p_adj = p * edgeFactor;
  let m = 1 / p_adj;  // This INCREASES multiplier
  ...
});

// FIXED (CORRECT):
const edgeFactor = targetMid;  // 0.91
const multipliers = p_final.map(p => {
  if (p <= 0) return dynamicMax;
  const m_fair = 1 / p;
  let m = m_fair * edgeFactor;  // This REDUCES multiplier = house edge
  m = clamp(m, caps.min, dynamicMax);
  return roundToLadder(m);
});
```

### Renormalization After Clipping

When we clamp multipliers to min/max caps, the implied sum drifts. Add a renormalization step:

```typescript
// After initial multiplier calculation
let multipliers = p_final.map(p => {
  if (p <= 0) return dynamicMax;
  const m_fair = 1 / p;
  let m = m_fair * edgeFactor;
  m = clamp(m, caps.min, dynamicMax);
  return roundToLadder(m);
});

// Renormalize to hit target implied sum exactly
const currentImplied = multipliers.reduce((s, m) => s + (1/m), 0);
if (currentImplied > targetMid + 0.02) {
  // Scale down all multipliers proportionally
  const scale = targetMid / currentImplied;
  multipliers = multipliers.map(m => {
    const scaled = m * scale;
    return roundToLadder(clamp(scaled, caps.min, dynamicMax));
  });
}
```

### Expected Result After Fix

| Market Type | Current implied_sum | Target | After Fix |
|-------------|---------------------|--------|-----------|
| WINNER | ~1.04 | 0.90-0.92 | 0.91 |
| PODIUM | ~1.07 | 0.84-0.86 | 0.85 |
| HIGHEST_SCORE | ~1.06 | 0.87-0.89 | 0.88 |

---

## Issue 2: Stale Market Liability

### The Problem

The `market_liability` table contains 4 rows from January 19th test data. Meanwhile:
- `predictions` table: 0 pending entries
- `bet_slips` table: 0 pending slips

The `house_bankroll_summary` view reads from `market_liability`, so it shows stale exposure instead of current reality.

### Root Cause

The trigger `trigger_update_market_liability` on `bet_slips` only fires on INSERT. There's no cleanup when:
- Bets are settled
- Bets are voided
- Test data is left behind

### The Fix: Add Rebuild Function + Settlement Cleanup

**Database Migration:**

```sql
-- 1. Create rebuild function
CREATE OR REPLACE FUNCTION rebuild_market_liability()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Clear stale data
  TRUNCATE market_liability;
  
  -- Rebuild from pending bet_slips only
  INSERT INTO market_liability (
    market_id,
    athlete_id,
    total_stake_tokens,
    total_potential_payout,
    bet_count,
    liability_if_wins
  )
  SELECT 
    market_id,
    athlete_id,
    SUM(stake_tokens) as total_stake_tokens,
    SUM(stake_tokens * multiplier_at_placement) as total_potential_payout,
    COUNT(*) as bet_count,
    SUM(stake_tokens * multiplier_at_placement) - SUM(stake_tokens) as liability_if_wins
  FROM bet_slips
  WHERE status = 'pending'
  GROUP BY market_id, athlete_id;
END;
$$;

-- 2. Add settlement cleanup trigger
CREATE OR REPLACE FUNCTION cleanup_liability_on_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- When bet_slip status changes from pending to settled/void
  IF OLD.status = 'pending' AND NEW.status IN ('settled', 'won', 'lost', 'void') THEN
    -- Decrement liability for this market/athlete
    UPDATE market_liability 
    SET 
      total_stake_tokens = total_stake_tokens - OLD.stake_tokens,
      bet_count = bet_count - 1,
      liability_if_wins = liability_if_wins - (OLD.stake_tokens * OLD.multiplier_at_placement - OLD.stake_tokens),
      updated_at = now()
    WHERE market_id = OLD.market_id AND athlete_id = OLD.athlete_id;
    
    -- Remove row if no bets left
    DELETE FROM market_liability 
    WHERE market_id = OLD.market_id 
      AND athlete_id = OLD.athlete_id 
      AND bet_count <= 0;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_cleanup_liability_on_settlement
AFTER UPDATE ON bet_slips
FOR EACH ROW
EXECUTE FUNCTION cleanup_liability_on_settlement();
```

**Immediate Action: Clear Stale Data**

Run once before launch:
```sql
TRUNCATE market_liability;
```

This resets to clean state. New entries will populate correctly via the existing insert trigger.

---

## Risk Dashboard: implied_sum Clarity

### Current Confusion

The dashboard shows `implied_sum > 1.0` which looks alarming. However, the real meaning depends on the payout model:

- **Sportsbook model**: implied_sum = SUM(1/odds) should be > 1.0 for house edge
- **Multiplier model**: implied_sum = SUM(1/mult) where mult = fair_mult × (1-edge)

Since we use multiplier model, we should track **house_edge_pct** instead.

### UI Update (Optional Enhancement)

In `src/pages/admin/RiskDashboard.tsx`, update the display:

```typescript
// Instead of showing implied_sum as the primary metric
// Show house_edge_pct = 1 - implied_sum (when implied_sum < 1)
const houseEdgePct = Math.max(0, 1 - impliedSum);
```

Label: "House Edge: 9.1%" instead of "Implied Sum: 0.909"

This is clearer for operators and removes the "implied_sum > 1.0 panic" scenario.

---

## Implementation Sequence

### Step 1: Fix Multiplier Math (5 minutes)
1. Edit `generate-market-odds/index.ts` lines 309-323
2. Change `1 / (p * edge)` to `(1/p) * edge`
3. Deploy edge function

### Step 2: Regenerate All Market Odds (2 minutes)
1. Call generate-market-odds for all 18 markets in "Final Test"
2. Verify implied_sum is now 0.85-0.92 per market type

### Step 3: Clear Stale Liability (1 minute)
1. Run `TRUNCATE market_liability`
2. Verify `house_bankroll_summary` shows 0 exposure

### Step 4: Add Settlement Cleanup Trigger (2 minutes)
1. Run migration to add `cleanup_liability_on_settlement` trigger
2. This prevents future stale data

### Step 5: Stress Test (5 minutes)
1. Place 5-10 test entries
2. Verify `market_liability` updates immediately
3. Verify Risk Dashboard shows correct exposure
4. Verify `validate-bet` blocks when approaching bankroll limit

---

## Verification Checklist

After fixes, confirm:

| Check | Expected |
|-------|----------|
| Winner market implied_sum | 0.90-0.92 |
| Podium market implied_sum | 0.84-0.86 |
| Highest Score implied_sum | 0.87-0.89 |
| Favorite multiplier | Lower than longshot |
| market_liability rows | 0 (after truncate, before new entries) |
| Risk Dashboard exposure | $0 (before new entries) |
| Place 5 entries | Liability increases immediately |
| validate-bet blocks | Only when worst_case > $5000 |

---

## Risk Assessment

| Fix | Risk | Mitigation |
|-----|------|------------|
| Multiplier formula change | Existing selections get new multipliers | Regenerate all before entries placed |
| Truncate market_liability | Lose historical data | It's stale test data anyway |
| Settlement trigger | Could miss edge cases | Rebuild function as backup |

---

## Time Estimate

- Code changes: 10 minutes
- Testing: 10 minutes
- Total: 20 minutes

**After these fixes, you have a financially sound system where the house maintains 8-15% edge and solvency is accurately tracked.**

