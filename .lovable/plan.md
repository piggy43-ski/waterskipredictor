

## Fix: Flatten Multiplier Distribution to Prevent Longshot Exploitation

### Problem
The current probability model is too concentrated on favorites:
- **Men's Trick**: Rank 1 = 3.4x, Rank 2 = 8.5x, Ranks 3-12 = ALL 20x
- **Women's Trick**: Rank 1 = 2.4x, Rank 2 = 7.5x, Ranks 3-9 = mostly 20x

This means 80% of athletes pay out 20:1 — massively favorable for bettors who pick any longshot.

### Root Cause
1. **Temperature too low** (0.85 for WINNER) — makes the softmax too sharp, concentrating probability on rank 1-2
2. **Global max cap too low** (8.0x in config) — forces the adaptive logic to push all the way to 20x to converge
3. **Weight ladder drops too steeply** — rank 1 = 1.00, rank 5 = 0.45, rank 10 = 0.24

### Fix (all in `supabase/functions/generate-market-odds/index.ts`)

| Change | Before | After |
|--------|--------|-------|
| WINNER temperature | 0.85 | 1.40 |
| WINNER max cap | 8.0 | 15.0 |
| Weight ladder | Steep drop (1.00 → 0.24) | Flatter curve (1.00 → 0.40) |
| Re-enable soft rank caps | All empty `{}` | Rank 1: 3.0x, Rank 2: 5.0x, Rank 3: 8.0x |

### Expected Outcome
For a 12-person men's field, multipliers should look roughly like:
- Rank 1: ~2.5-3.0x
- Rank 3: ~5-6x
- Rank 6: ~8-10x
- Rank 12: ~14-15x

Implied sum stays in 0.90-0.92 band, but spread is much more compressed — no athlete at 20x.

### After Deploy
- Re-run `generate-market-odds` for both Swiss Pro trick markets
- Verify no athlete exceeds 15x and implied sum is in band

### Files Changed
| File | Change |
|------|--------|
| `supabase/functions/generate-market-odds/index.ts` | Raise temperature, raise global max cap, flatten weight ladder, add soft rank caps |

