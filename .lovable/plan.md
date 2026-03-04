

# Add Editable Multipliers to Probability Editor

## Problem
The Mult column is read-only. When the admin changes WINNER %, the displayed multiplier doesn't change because it shows the calibrated value from `market_odds.final_decimal_odds`. The admin wants to directly edit multipliers per athlete.

## Plan

### File: `src/components/admin/ProbabilityEditor.tsx`

1. **Add local multiplier state** (`localMultipliers`) alongside `localProbs`, keyed by `groupKey → athleteId → number`. Initialize from `athlete.multiplier`.

2. **Make Mult column editable**: Replace the static display with an `<Input>` field (same style as the WINNER % input). When the admin types a new multiplier value, update `localMultipliers` state.

3. **Update implied sum calculation** (`getLocalImpliedSum`): Use `localMultipliers` values instead of the static `athlete.multiplier`, so the implied sum badge updates live as the admin edits.

4. **Save multiplier overrides on "Save & Apply"**: In `saveGroupMutation`, after saving probability overrides, also upsert any changed multipliers into `market_multiplier_overrides` (market_id, athlete_id, manual_multiplier). Then call `generate-market-odds` which already respects these overrides.

5. **Validation**: Clamp multiplier inputs to 1.10–25.00 range. Highlight invalid values in red.

6. **Widen grid columns** slightly to accommodate the new input (change Mult column from `80px` to `100px`).

### Behavior
- Editing WINNER % will auto-recalculate a suggested multiplier via the formula and update the Mult input (unless the admin has manually overridden the multiplier for that athlete).
- Editing Mult directly marks it as "manually overridden" and won't be auto-updated by WINNER % changes.
- A small "A" (auto) or "M" (manual) badge next to the multiplier indicates the source.
- Reset button clears both probability and multiplier overrides.

### Files Changed
- `src/components/admin/ProbabilityEditor.tsx`

