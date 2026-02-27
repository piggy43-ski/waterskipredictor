

# Plan: Update Beta Testing 2 Dates + End-to-End Testing

## Current State
- **Tournament**: BETA TESTING 2 (id: `8a248880-...`)
- **Current start**: Feb 28 11:38 UTC (tomorrow) — predictions lock here
- **Current end**: March 5 18:00 UTC
- **Activity**: 48 bets from 15 users, 59 entries across 51 athletes
- **Markets**: 18 markets exist but all show `is_published = false` (likely were published earlier and toggled)

## Database Update

Update the tournament so predictions close in 5 days (March 4, Monday) and settlement happens on Monday:

```sql
UPDATE tournaments
SET 
  start_datetime = '2026-03-04 08:00:00+00',
  end_datetime   = '2026-03-04 18:00:00+00',
  start_date     = '2026-03-04',
  end_date       = '2026-03-04'
WHERE id = '8a248880-9b02-42a2-99f9-ff4682be0b2e';
```

This means:
- Predictions stay **open** until Monday March 4 at 8:00 AM UTC
- Tournament "ends" Monday evening — settlement can happen after that

## End-to-End Browser Testing

After the date update, test the full flow in the preview:

1. **Tournaments page** — verify Beta Testing 2 shows "Locks in 5d" status
2. **Tournament detail** — open Beta Testing 2, verify markets/athletes load
3. **Single prediction** — pick an athlete, set stake, confirm submission succeeds
4. **Parlay/combo prediction** — pick Winner + Podium + High Score, stake 50 tokens, confirm no decimal error
5. **Predictions page** — verify the new entries appear with correct payout (integer, no decimals)
6. **Wallet** — verify balance deducted correctly

