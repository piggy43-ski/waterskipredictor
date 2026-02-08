

# Fix: Regenerate PODIUM and HIGHEST_SCORE Markets

## The Problem
The PODIUM markets were not regenerated after we deployed the updated rank-specific caps. They still have the old, dangerous multipliers:

| Market | Rank 1 | Expected Cap | Rank 2 | Expected Cap | Rank 3 | Expected Cap |
|--------|--------|--------------|--------|--------------|--------|--------------|
| Men Jump PODIUM | 7.5x | **1.25x** | 8.5x | **1.75x** | 11.5x | **2.25x** |
| Women Jump PODIUM | 7.5x | **1.25x** | 12x | **1.75x** | 11.5x | **2.25x** |

The same issue exists for all PODIUM and HIGHEST_SCORE markets.

## Solution
Simply re-invoke the `generate-market-odds` function for ALL markets (WINNER, PODIUM, HIGHEST_SCORE) in the BETA tournament. The rank-specific caps are already correctly defined in the deployed code:

```
PODIUM Rank Caps:
  Rank 1: 1.25x
  Rank 2: 1.75x  
  Rank 3: 2.25x
  Rank 4+: 6.0x (global max)

HIGHEST_SCORE Rank Caps:
  Rank 1: 1.80x
  Rank 2: 2.50x
  Rank 3: 3.50x
  Rank 4+: 7.0x (global max)
```

## Implementation Steps

1. **Query all markets** for the BETA tournament (d26feef0-7dee-4eba-aa8b-d36df42b30f7)
2. **Invoke `generate-market-odds`** for each PODIUM and HIGHEST_SCORE market with `force: true`
3. **Verify results** — confirm multipliers now respect the rank caps

## Expected Results After Fix

### Men Jump PODIUM
| Athlete | Rank | Old Multiplier | New Multiplier |
|---------|------|----------------|----------------|
| Dodd Ryan | 1 | 7.5x | **1.25x** |
| Poland Joel | 2 | 8.5x | **1.75x** |
| Critchley Jack | 3 | 11.5x | **2.25x** |
| Others | 4+ | 11.5x | 4-6x |

### Women Jump PODIUM
| Athlete | Rank | Old Multiplier | New Multiplier |
|---------|------|----------------|----------------|
| Straltsova Hanna | 1 | 7.5x | **1.25x** |
| Wroblewski Annemarie | 2 | 12x | **1.75x** |
| Danisheuskaya | 3 | 11.5x | **2.25x** |

Similar corrections for all PODIUM and HIGHEST_SCORE markets across Slalom, Trick, and Jump.

## Files to Modify
No code changes needed — just need to trigger market regeneration.

## Verification
After regeneration, query the database to confirm:
- All PODIUM Rank 1 athletes have multiplier ≤ 1.25x
- All PODIUM Rank 2 athletes have multiplier ≤ 1.75x
- All PODIUM Rank 3 athletes have multiplier ≤ 2.25x
- All HIGHEST_SCORE Rank 1 athletes have multiplier ≤ 1.80x

