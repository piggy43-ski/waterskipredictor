

# Clean Up Moomba Masters: Delete Selections, Market Odds, and Markets

## Problem
You deleted ~60 athletes from `tournament_entries` for Moomba Masters, but the UI still shows them because the data lives in three other tables that weren't cleaned up:
- **198 selections** across 12 markets
- **198 market_odds** rows
- **12 markets** themselves

No users have placed any bets on this tournament, so deletion is safe.

## Plan

Run three DELETE statements (via the data insert tool) in dependency order:

1. **Delete market_odds** for all Moomba Masters markets
2. **Delete selections** for all Moomba Masters markets
3. **Delete markets** for Moomba Masters tournament

```sql
-- Step 1: Remove odds
DELETE FROM market_odds WHERE market_id IN (
  SELECT id FROM markets WHERE tournament_id = '6b2ee218-5957-41ec-be67-1d1d5af281ae'
);

-- Step 2: Remove selections
DELETE FROM selections WHERE market_id IN (
  SELECT id FROM markets WHERE tournament_id = '6b2ee218-5957-41ec-be67-1d1d5af281ae'
);

-- Step 3: Remove markets
DELETE FROM markets WHERE tournament_id = '6b2ee218-5957-41ec-be67-1d1d5af281ae';
```

This will fully clean the Moomba Masters event so when you re-enter it, it shows no athletes. The tournament record itself remains so you can re-add the correct athletes later.

