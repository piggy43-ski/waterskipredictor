## Model A: drop implied-by picks within each leg

### Rule

Within one leg, if **Podium 1-2-3** is picked, the **Winner** pick is mathematically implied (Podium #1 = Winner). It contributes no new information, so drop it from the leg's factor.

**Highest Score is kept always.** It's only weakly correlated with finishing order (a skier can win and not post the top score, or post the top score and finish 2nd).

```text
within a leg:
  contributors = []
  if podium picked:
      contributors += [podiumMultiplier]                 // implies winner
  else if winner picked:
      contributors += [winner.decimal_odds]
  if highestScore picked:
      contributors += [highestScore.decimal_odds]

  legFactor = sum(contributors)  // 1 if empty

across legs:
  raw   = Π legFactor
  final = max(raw × 0.75, 1.0)
```

### Reproduce screenshot parlay

- L1: drop Winner (1.5), keep Podium (7.25) + Highest (3.00) = **10.25**
- L2: drop Winner (1.2), keep Podium (11.45) + Highest (1.40) = **12.85**
- Raw 131.71 × 0.75 = **~98.78x** (down from 123.82x)

### Files to change

**`src/utils/parlayMultipliers.ts`**
- Rewrite `calculateRawParlayMultiplier` to apply the Model A rule above.
- Add a new exported helper:
  ```ts
  getLegBreakdown(leg): {
    rows: Array<{ kind: 'winner'|'podium'|'highest'; value: number; included: boolean; reason?: string }>;
    legFactor: number;
  }
  ```
  `included=false` rows carry `reason: 'Implied by Podium'` so the UI can render them struck-through with a tag.

**`src/components/ParlayBuilder.tsx`** (Summary card around lines 863–897)
- Read `getLegBreakdown(leg)` once per leg.
- For each sub-pick row:
  - included → render as today.
  - not included → grey/strikethrough multiplier badge, append a small muted tag "Included in Podium".
- Bottom total continues to use `getParlayMultiplierDetails(...).finalMultiplier`, which now reflects Model A.
- No copy mentioning "risk", "cap", or "correlation" to the user — match the Risk UX neutral-language rule. Tag text: **"Included in Podium"**.

**`src/utils/__tests__/parlayMultipliers.test.ts`**
- Update the screenshot-reproduction test to expect ~98.78x.
- Existing winner-only and podium-only tests unchanged (no Winner+Podium overlap in those).
- Add a test that explicitly verifies Winner is dropped when Podium is also picked in the same leg, and is kept when Podium is not picked.

### Out of scope

- DB triggers, edge functions, settlement, podium combined-multiplier caps, override resolution — unchanged.
- Cross-leg correlation — N/A, legs are different discipline+gender by construction.
- Highest-vs-Winner correlation — explicitly not modeled in v1 (Model A only drops Winner-implied-by-Podium).

### Verification

1. Reproduce the screenshot parlay → ~98.78x total; Leg 1 Winner row shows "1.50x · Included in Podium" struck through; Leg 2 same.
2. Build a Winner-only parlay → multiplier identical to today.
3. Build a Winner + Highest leg (no Podium) → Winner is kept, sum applies.
4. Build a Podium-only leg → unchanged.
5. `bunx vitest run src/utils/__tests__/parlayMultipliers.test.ts src/utils/__tests__/parlaySafetyFixes.test.ts` passes.
