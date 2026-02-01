
# Add Multiplier Override When Adding Athletes to Tournament

## Overview
Enable admins to set custom multipliers directly when adding athletes to a tournament, with those values being saved as proper multiplier overrides that persist and override auto-generated odds.

---

## Current Behavior

- When adding athletes manually, there's a "custom odds" input, but it only sets the initial `custom_odds` field on `tournament_entries`
- The actual multiplier shown to users comes from `selections.decimal_odds` which gets overwritten by the `generate-market-odds` function
- To truly lock in a specific multiplier, admins must go to a separate "Multiplier Override" page after entries are created

## New Behavior

- When adding athletes with a custom multiplier value, the system will:
  1. Add the tournament entry as before
  2. Create markets and selections as before
  3. **NEW:** Also create entries in `market_multiplier_overrides` for any athlete with a custom value
  4. Update the selection's `decimal_odds` to match the override
- The multiplier will be truly locked and won't be changed by auto-generation

---

## Implementation

### File: `src/pages/admin/TournamentEntries.tsx`

**1. Update the Manual Add Flow (lines ~800-855)**

After creating markets and selections, add logic to create multiplier overrides for athletes that have custom odds specified:

```text
For each athlete with customOdds[athleteId]:
  → Find the created market(s) for this athlete's discipline/gender
  → Insert into market_multiplier_overrides:
    - market_id: the WINNER market ID
    - athlete_id
    - manual_multiplier: the custom value
    - is_enabled: true
    - reason: "Set on tournament entry"
  → Also update selections.decimal_odds to match
```

**2. Update the UI Label (lines ~1117-1128)**

Change the placeholder from "Auto: X.XXx" to clarify this is an override:
```text
placeholder="Override multiplier"
```

Add a tooltip or helper text:
```text
"Leave blank for auto-calculated, or enter a value to lock this multiplier"
```

**3. Update the AI Import Flow (optional enhancement)**

The AI import preview dialog could also include an "Override Rating" input that gets converted to a locked multiplier.

---

## Technical Flow

```text
┌─────────────────────────────────────────────────────────────────┐
│                   Admin: Add Athletes                           │
├─────────────────────────────────────────────────────────────────┤
│  [x] Athlete A   Rank: 3   [ 3.50 ] ← Custom multiplier        │
│  [x] Athlete B   Rank: 7   [      ] ← Will use auto            │
│  [x] Athlete C   Rank: 12  [ 8.00 ] ← Custom multiplier        │
│                                                                 │
│  [Add 3 Athletes & Generate Markets]                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
           ┌──────────────────────────────────────────┐
           │  1. Create tournament_entries            │
           │  2. Create/update markets               │
           │  3. Create selections with auto odds    │
           │  4. Run generate-market-odds            │
           │  5. For A & C: insert into              │
           │     market_multiplier_overrides         │
           │  6. Update selections.decimal_odds      │
           │     to match override                   │
           └──────────────────────────────────────────┘
                              ↓
           Athletes A & C locked at 3.50x and 8.00x
           Athlete B uses auto-generated multiplier
```

---

## Database Operations

**New inserts after market creation:**

```sql
-- For each athlete with custom multiplier:
INSERT INTO market_multiplier_overrides 
  (market_id, athlete_id, manual_multiplier, is_enabled, reason)
VALUES 
  ($market_id, $athlete_id, $custom_value, true, 'Set on tournament entry');

-- Also update the selection:
UPDATE selections 
SET decimal_odds = $custom_value
WHERE market_id = $market_id AND athlete_id = $athlete_id;
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/admin/TournamentEntries.tsx` | Add override creation logic after market generation |

---

## Edge Cases Handled

1. **Multiplier caps:** Apply min/max limits (2.0-20.0 for WINNER markets)
2. **All market types:** Apply override to WINNER, PODIUM, and HIGHEST_SCORE markets (adjusting PODIUM multiplier accordingly)
3. **Regeneration:** Overrides will persist even if `generate-market-odds` is run again, because the MarketOddsReview UI checks for overrides

---

## Result

Admins can set exact multipliers when adding athletes to tournaments. These overrides:
- Are immediately applied to the selection's decimal_odds
- Persist through any odds regeneration
- Are visible in the "Multiplier Override" page with a "Set on tournament entry" reason
- Can still be edited or removed later from the Multiplier Override page
