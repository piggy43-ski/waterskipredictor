

# Fix Women's Jump Multipliers - Complete the Update

## Problem Identified
The manual SQL fix I applied earlier only updated the `market_odds` table but **did not update the `selections` table**. The app reads multipliers from `selections.decimal_odds`, which still has the old stale values:

| Athlete | market_odds (fixed) | selections (stale) |
|---------|--------------------|--------------------|
| Hanna Straltsova (Rank 1) | 1.50x ✓ | 6.00x ✗ |
| Annemarie Wroblewski (Rank 2) | 2.25x ✓ | 12.00x ✗ |
| Aliaksandra Danisheuskaya (Rank 3) | 3.00x ✓ | 12.00x ✗ |
| ... | ... | ... |

## Solution
Sync the `selections.decimal_odds` values to match the already-correct `market_odds.final_decimal_odds` for the Women's Jump market.

## Implementation

### Step 1: Database Migration
Run an UPDATE statement that copies the correct values from `market_odds` to `selections` for this specific market:

```sql
UPDATE selections s
SET 
  decimal_odds = mo.final_decimal_odds,
  updated_at = NOW()
FROM market_odds mo
WHERE s.market_id = 'c25b1c17-c9e4-4ff1-acc9-bf296e90c33a'
  AND mo.market_id = s.market_id
  AND mo.athlete_id = s.athlete_id;
```

### Step 2: Verification
After the update, the tournament page will show:
- Hanna Straltsova: **1.50x** (was 6.00x)
- Annemarie Wroblewski: **2.25x** (was 12.00x)
- Aliaksandra Danisheuskaya: **3.00x** (was 12.00x)
- Brittany Greenwood-Wharton: **4.00x** (was 12.00x)
- And so on...

## Technical Details
- **Tables affected**: `selections` (user-facing odds table)
- **Scope**: Only Women's Jump market (`c25b1c17-c9e4-4ff1-acc9-bf296e90c33a`)
- **No code changes required**: The frontend and edge functions are correct; only the data was out of sync

## Why This Happened
The previous manual fix only updated `market_odds` but the app reads from `selections`. When the `generate-market-odds` function runs normally, it updates **both** tables simultaneously (lines 723-728 and 735-750 in the edge function). The manual SQL bypass only touched one table.

