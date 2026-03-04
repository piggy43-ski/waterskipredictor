

# Fix: Settlement Summary Not Showing Correct Prediction Counts & Payouts

## Problems Found

After auditing the `calculateSettlementPreview` function in `TournamentSettlement.tsx`, I found **three bugs** causing incorrect settlement summaries:

### Bug 1: Case Mismatch on Bet Slip Status (Critical)
Lines 986 and 1017 query `bet_slips` with `.eq('status', 'pending')` (lowercase), but the actual database values are `'PENDING'` (uppercase). This means **parlay payouts are never found**, so payout amounts are wrong.

### Bug 2: Parlay `leg_count` Filter Excludes Most Parlays
Line 987 uses `.gt('leg_count', 1)` to find parlays. However, most parlay bet_slips in the database have `leg_count: 1` (each prediction leg gets its own bet_slip record). Only the rare multi-leg slips (e.g., 3-leg combos) are found. The correct filter should use `.eq('type', 'parlay')` instead.

### Bug 3: Individual Parlay Legs Inflate Prediction Counts
Each parlay leg is stored as a separate prediction, so a single 5-leg parlay shows as **5 predictions** in the "Won" or "Lost" columns. The summary should group parlays by their bet_slip and count each parlay as one entry.

## Data Evidence
- `bet_slips.status` = `'PENDING'` (uppercase) in the database
- Most parlay bet_slips have `leg_count: 1` with `type: 'parlay'`
- Parlay prediction rows have `potential_payout: 0` (payout lives on the bet_slip)

## Changes

### File: `src/pages/admin/TournamentSettlement.tsx`

1. **Fix case mismatch** (lines 986, 1017): Change `'pending'` → `'PENDING'`

2. **Fix parlay filter** (line 987): Change `.gt('leg_count', 1)` → `.eq('type', 'parlay')` to catch all parlay slips

3. **Add entry-level summary** alongside prediction-level counts: Show both "X predictions" and "Y entries" so the admin sees meaningful numbers. Add a summary row that groups predictions by `bet_slip_id` to count unique entries.

4. **Update the settlement preview UI** (lines 2018-2047): Add an "Entries" column showing unique bet_slip count, and label the existing column as "Legs" for clarity when parlays are involved.

## Technical Detail

The `calculateSettlementPreview` function (line 714) will be updated to:
- Query bet_slips with correct uppercase `'PENDING'` status
- Use `type = 'parlay'` filter instead of `leg_count > 1`
- Count unique `bet_slip_id` values from matched predictions to derive entry count
- Include entry count in the `SettlementPreview` type

The preview UI grid will go from 4 columns (Predictions / Won / Lost / Payout) to 5 columns (Entries / Predictions / Won / Lost / Payout), giving the admin a clearer picture of how many real bets are affected.

