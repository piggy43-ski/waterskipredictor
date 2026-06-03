## Problem

Current parlay math multiplies every sub-pick within a leg AND across legs:

`1.5 × 7.25 × 3.0 × 1.2 × 11.45 × 1.4 × 0.75 = 470.68x`

This overpays on correlated outcomes (Ross as Winner + Ross #1 on Podium are not independent events).

## Fix

Switch intra-leg combination from **product** to **sum**. Cross-leg combination stays multiplicative. Haircut and floor unchanged.

### New formula

```text
legFactor(leg) = (winner?.decimal_odds ?? 0)
               + (leg.podiumMultiplier ?? 0)
               + (highestScore?.decimal_odds ?? 0)
               // if a leg has only one sub-pick, the sum == that pick

parlayRaw     = Π legFactor(leg)   // product across legs
final         = max(parlayRaw × 0.75, 1.0)
```

### Recheck with the screenshot

- Leg 1 sum: `1.5 + 7.25 + 3.0 = 11.75`
- Leg 2 sum: `1.2 + 11.45 + 1.4 = 14.05`
- Raw: `11.75 × 14.05 = 165.09`
- × 0.75 haircut = **123.82x**

A single-pick leg (e.g. just a Winner at 1.5x) still contributes 1.5x — identical to today, so simple parlays are unaffected.

## Files to change

- `src/utils/parlayMultipliers.ts` — rewrite `calculateRawParlayMultiplier` to sum within a leg then multiply across legs. Guard: ignore zero/undefined sub-picks so a single-pick leg behaves as before.
- `src/utils/__tests__/parlayMultipliers.test.ts` — update expected values (cross-leg-only tests with one sub-pick per leg stay the same; multi-sub-pick-in-one-leg tests get new expected sums).

## Out of scope

- No DB/trigger changes.
- No change to per-leg caps, 1000-token podium stake cap, chalk-concentration cap, settlement edge function, or override resolution.
- Summary UI still shows each sub-multiplier on its row (unchanged); only the bottom total recomputes.

## Verification

1. Reproduce the screenshot's parlay → expect ~123.82x instead of 470.68x.
2. Build a 3-leg parlay with one Winner each (e.g. 1.5 × 2.0 × 2.5 × 0.75) → expect 5.625x (unchanged from today).
3. Run `bunx vitest run src/utils/__tests__/parlayMultipliers.test.ts`.
4. Place a small test entry on tournament `dad9b595…`, confirm submitted multiplier matches UI.
