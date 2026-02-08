
# Updated Plan: Aggressive Rank-Specific Caps (Rank 1 → 1.5x)

## The Key Change
The user wants **Rank 1 (the highest-rated athlete) capped at 1.5x**, not 3.0x. This is much tighter—a 50% payout maximum for the favorite.

## Updated Configuration

```text
MULTIPLIER_CAPS (global bounds):
  WINNER:        min 1.50x  →  max 8.0x   (was 1.8–12.0)
  PODIUM:        min 1.25x  →  max 6.0x   (was 1.4–10.0)
  HIGHEST_SCORE: min 1.50x  →  max 7.0x   (was 2.0–8.0)

RANK_SPECIFIC_CAPS (for WINNER markets):
  Rank 1:  max 1.50x  ← AGGRESSIVE FAVORITE CAP (was 3.0x)
  Rank 2:  max 2.25x
  Rank 3:  max 3.00x
  Rank 4:  max 4.00x
  Rank 5:  max 5.00x
  Rank 6+: max 8.00x  (longshots)

RANK_SPECIFIC_CAPS (for PODIUM markets):
  Rank 1:  max 1.25x
  Rank 2:  max 1.75x
  Rank 3:  max 2.25x
  Rank 4+: max 6.00x

RANK_SPECIFIC_CAPS (for HIGHEST_SCORE markets):
  Rank 1:  max 1.80x
  Rank 2:  max 2.50x
  Rank 3:  max 3.50x
  Rank 4+: max 7.00x
```

## Expected Results After Fix

### Men Slalom (Nate Smith example)
| Athlete | Rating | Field Rank | Probability | New Multiplier | Payout per Token Wagered |
|---------|--------|------------|------------|----------------|-------------------------|
| Nate Smith | 99 | 1 | ~25% | **1.50x** | +0.50 tokens |
| Winter | 90 | 2 | ~14% | **2.25x** | +1.25 tokens |
| Ross | 95 | 3 | ~14% | **3.00x** | +2.00 tokens |
| Travers | 85 | 4 | ~7% | **4.00x** | +3.00 tokens |
| Others | <90 | 5+ | <7% | **5-8x** | +4-7 tokens |

### Rationale
- **Nate at 1.50x**: When he wins (~25% of time), house only loses 0.50 tokens per 1 wagered
- **Gradual increase down field**: Rank 2 is 2.25x (1.5x more), Rank 3 is 3.0x, etc.
- **Longshots rewarded**: Rank 6+ can reach 8x, giving players incentive to take chances
- **Implied sum**: Still lands in 0.90–0.92 range (8–10% house edge maintained)

## Files to Modify

### 1. `supabase/functions/generate-market-odds/index.ts`
- Update `MULTIPLIER_CAPS` global bounds (lines 24–28)
- Add `RANK_CAPS` configuration object (new section after line 28)
- Modify `deriveMultipliersCalibrated()` function to:
  - Accept `fieldRanks` map as parameter
  - Apply rank-specific caps BEFORE global caps
  - Enforce strict monotonicity: Rank N ≥ Rank N-1 multiplier
  - If favorites are capped and implied sum too low, redistribute to tail athletes only

### 2. `src/utils/multiplierUtils.ts`
- Update `MULTIPLIER_CONFIG.MULTIPLIER_CAPS` (lines 25–29)
- Update `MULTIPLIER_CONFIG.WINNER_RANK_CAPS` (lines 32–36) to match new caps:
  ```typescript
  WINNER_RANK_CAPS: {
    1: 1.50,   // Aggressive favorite cap
    2: 2.25,
    3: 3.00,
    4: 4.00,
    5: 5.00,
  }
  ```
- Add `PODIUM_RANK_CAPS` and `HIGHEST_SCORE_RANK_CAPS` (new sections)
- Update `validateMultiplier()` function to check against rank-specific caps

### 3. `src/utils/multiplierCaps.ts`
- Update `MULTIPLIER_CAPS` constant (lines 3–6)
- Add `PODIUM_RANK_CAPS` and `HIGHEST_SCORE_RANK_CAPS` objects (new)
- Update validation in `validateMultiplier()` function to reference rank caps

## Algorithm Implementation Details

```text
CALIBRATION FLOW:
1. Sort athletes by field rank (best first)
2. For each athlete by rank:
   a. Get rank-specific cap (e.g., rank 1 → 1.50x max)
   b. Calculate raw multiplier: m = 1 / (p × 0.91)  [target midpoint]
   c. Apply rank cap: m = min(m, rank_cap)
   d. Apply global cap: m = clamp(m, global_min, global_max)
   e. Round to ladder
3. Calculate implied sum from all multipliers
4. If implied sum too low (< 0.90):
   → ONLY increase tail athletes (rank 6+) toward their max caps
   → Keep favorites (rank 1–3) locked at their caps
5. If implied sum too high (> 0.92):
   → Decrease k scaling factor slightly and re-run
6. Final monotonicity enforcement:
   → If rank N < rank N-1, set rank N = rank N-1 + 0.05

VALIDATION (post-generation):
- Rank 1 must be ≤ 1.50x ✓
- Rank 2 must be ≤ 2.25x ✓
- All multipliers must satisfy monotonicity ✓
- Implied sum must be 0.90–0.92 ✓
- If ANY validation fails → Mark market as NEEDS_REVIEW
```

## Rollout & Verification

1. Deploy updated `generate-market-odds` function
2. Regenerate ALL 18 markets (Men/Women Slalom, Trick, Jump)
3. Verify each discipline:
   - **Men Slalom**: Nate Smith = 1.50x
   - **Men Trick**: Jake Abelson = 1.50x
   - **Men Jump**: Joel Poland = 1.50x
   - **Women Slalom**: Top athlete = 1.50x
   - **Women Trick**: Top athlete = 1.50x
   - **Women Jump**: Top athlete = 1.50x
4. Verify implied sums within 0.90–0.92
5. Verify all markets show `odds_validation_status: 'VALID'`
6. Unblock tournament for users

## Risk Assessment
- **House Risk**: Dramatically reduced. Nate at 1.50x means 50% max payout even if he wins frequently.
- **User Appeal**: Reduced for favorites, but improved for mid-tier and longshots (4–8x range).
- **Market Viability**: Still profitable with 8–10% house edge, but users won't all pile on the favorite expecting 7x payouts.

