

# Fix Tournament Dates for E2E Testing

## Problem Identified

The "Final Test" tournament has:
- **Status**: `upcoming`
- **Dates**: Jan 24-25, 2026 (past dates - today is Jan 31)
- **Result**: Tournament doesn't appear in "Upcoming" or "Live" tabs, blocking predictions

## Solution

Update the tournament dates to future dates so predictions can be placed.

### Database Change Required

```sql
UPDATE tournaments 
SET start_date = '2026-02-02', 
    end_date = '2026-02-03' 
WHERE name = 'Final Test';
```

This sets the tournament to:
- **Start**: Feb 2, 2026 (2 days from now)
- **End**: Feb 3, 2026

## After Fix - E2E Test Flow

Once dates are updated:

1. **Navigate** to Tournaments → Upcoming tab
2. **Click** "Final Test" tournament
3. **Select** a market (e.g., "Men's Slalom Winner")
4. **Pick** an athlete and place a prediction
5. **Verify** `bet_confirmation` email in `email_logs` table
6. **Navigate** to Admin → Tournament Settlement
7. **Run** settlement for the tournament
8. **Verify** `bet_result` email in `email_logs` table
9. **Check** wallet balance updated correctly

## Technical Notes

- All 18 markets are now published and will be visible
- Selection odds have been generated via Monte Carlo
- Email integration is configured with verified domain

