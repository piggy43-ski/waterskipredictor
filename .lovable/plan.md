

# Fix: Settlement Summary Mixing Up Entries and Prediction Legs

## Problem

The settlement summary currently counts **prediction legs** as "Won" and "Lost" instead of **entries (bet slips)**. A user who placed one 3-leg combo entry shows as "3 Won" or "3 Lost" instead of "1 Won" or "1 Lost". This is the same confusion from the last beta.

The root issue: `won_count` and `lost_count` are derived from `winningPredictionIds.length` and `losingPredictionIds.length` — these are prediction-level, not entry-level.

## Fix

### In `calculateSettlementPreview` (~lines 930-1045)

After determining `winningPredictionIds` and `losingPredictionIds`, group them by `bet_slip_id` to derive **entry-level** won/lost counts:

- **Entries Won**: Count unique `bet_slip_id` values where ALL legs of that slip are in `winningPredictionIds`
- **Entries Lost**: Count unique `bet_slip_id` values where ANY leg is in `losingPredictionIds`
- Keep the existing prediction-level counts as `won_legs` / `lost_legs` for the "Legs" detail

### In the `SettlementPreview` type (line 55-69)

Add `won_entries` and `lost_entries` fields. Keep `won_count`/`lost_count` for internal leg-level tracking but rename them in the UI.

### In the UI (lines 2023-2059)

Update the grid to show:
- **Entries**: total unique bet slips (already exists)
- **Won**: entry-level won count (new `won_entries`)
- **Lost**: entry-level lost count (new `lost_entries`)
- **Payout**: total payout (already correct)

Remove the "Legs" column — it's confusing for the admin. The entry-level view is what matters.

### Technical Detail

Group predictions by `bet_slip_id` from the fetched predictions data:
```
const predictionsBySlip = Map<bet_slip_id, prediction[]>
- won_entries = slips where every prediction.id is in winningPredictionIds
- lost_entries = slips where at least one prediction.id is in losingPredictionIds
```

This ensures a parlay with 3 winning legs = 1 Won entry, and a parlay with 2 winning + 1 losing leg = 1 Lost entry.

