

# Fix: Update Tournament and Fantasy Dates

## Current Issue
The BETA tournament is set to start **today at 8:00 AM UTC** which is causing timing conflicts:
- **Prediction window**: Says "5h until predictions open" (confused by date/time)
- **Fantasy**: Says "5h until lock"

This mismatch is confusing users and preventing them from making predictions.

## The Fix
Update the tournament times in the database to:
- **Start**: Monday Feb 10, 2026 at 1:00 AM UTC
- **End**: Monday Feb 10, 2026 at 6:00 PM UTC

This gives users the entire weekend to create fantasy teams and place predictions.

## Database Changes

### 1. Update Tournament
```sql
UPDATE tournaments 
SET 
  start_date = '2026-02-10',
  end_date = '2026-02-10',
  start_datetime = '2026-02-10 01:00:00+00',
  end_datetime = '2026-02-10 18:00:00+00'
WHERE id = 'd26feef0-7dee-4eba-aa8b-d36df42b30f7';
```

### 2. Fantasy Pot
The fantasy pot (`986cefbc-b6d1-45f5-a46f-1202a630abd8`) is linked to the tournament via `tournament_id`. It uses the tournament's `start_datetime` to calculate lock time automatically through `fantasyLockRules.ts` — no separate update needed.

## Expected Behavior After Fix

### Prediction Window (Tournament Card)
| Time | Status | Message |
|------|--------|---------|
| Now (Sunday) | **open** | "Predictions open – Starts in 1d 17h" |
| Monday 1am | closed | "Predictions locked – event in progress" |
| Monday 6pm | finished | "Tournament finished" |

### Fantasy Pot Lock
| Time | Status | Message |
|------|--------|---------|
| Now (Sunday) | **open** | "1d 17h until lock" |
| Monday 1am | locked | "Tournament has started - entries locked" |

## No Code Changes Required
Both systems already use `start_datetime` from the tournament:
- `predictionWindows.ts` → Opens predictions 24h before start
- `fantasyLockRules.ts` → Locks entries when tournament goes live

Just need to update the database dates and everything will sync automatically.

