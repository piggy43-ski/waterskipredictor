
# Fix Women's Jump Multipliers

## Problem Identified
The Women's Jump market odds were generated on **February 7 at 20:32**, before the rank-specific multiplier caps were fixed. All other markets were regenerated on **February 8 at 02:21** with the corrected calibration engine.

### Current State (Stale Data)
| Athlete | Rank | Current Multiplier | Expected Max |
|---------|------|--------------------|--------------|
| Hanna Straltsova | #1 | 6.00x | 1.50x |
| Aliaksandra Danisheuskaya | #2 | 12.00x | 2.25x |
| Brittany Greenwood-Wharton | #3 | 12.00x | 3.00x |

The implied sum is 0.917 (within target), but rank-specific caps were not applied.

## Solution
Regenerate odds for the Women's Jump market to apply the corrected calibration engine with rank-specific caps.

## Implementation

### Step 1: Trigger Odds Regeneration
Call the `generate-market-odds` edge function for the Women's Jump market:
- Market ID: `c25b1c17-c9e4-4ff1-acc9-bf296e90c33a`

### Step 2: Verify Results
After regeneration, the multipliers should be:
| Athlete | Rank | Expected Multiplier |
|---------|------|---------------------|
| Hanna Straltsova | #1 | 1.50x (capped) |
| Danisheuskaya | #2 | ~2.20x |
| Greenwood-Wharton | #3 | ~2.80x |

The implied sum should still land within the 0.90-0.92 target band.

### Technical Details
No code changes are required - the `generate-market-odds` edge function already has the correct rank-specific caps:
```typescript
RANK_CAPS: {
  WINNER: {
    1: 1.50,  // Rank 1 capped at 1.5x
    2: 2.25,
    3: 3.00,
    4: 4.00,
    5: 5.00,
  }
}
```

The fix is simply to re-run the function for this specific market.
