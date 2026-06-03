# Goal

Let a parlay contain any mix of WINNER, PODIUM (exact 1-2-3), and HIGHEST_SCORE legs across any discipline and any gender. Each added leg multiplies into the parlay product, so more legs → bigger payout.

# What already works (no change needed)

- "Add Another Leg" is already wired. After completing a leg you go back to the Context step and can pick a different discipline + gender.
- `isDuplicateLeg` only blocks repeating the **same discipline+gender** pair, which is the correct correlation block — you can have men's slalom + women's slalom + men's jump + women's trick all in one parlay.
- The product math (`calculateRawParlayMultiplier` × 0.75 haircut) already multiplies every leg's `decimal_odds` together.

What's blocking podium/highest from being parlay legs is two gates that were added by the earlier "parlay safety v2" work.

# Changes

## 1. DB — `enforce_parlay_leg_rules` trigger (new migration)

Remove the two unconditional rejections that currently throw `parlay_market_ineligible`:

- The `IF v_market_type IN ('PODIUM','HIGHEST_SCORE')` block
- The `IF NEW.selection_id LIKE '%-podium'` block

Keep everything else in the trigger (chalk concentration cap, unresolved-selection guards for >2500 stake, etc.).

Also keep `enforce_podium_single_stake_cap` unchanged — that 1000-token podium cap will still apply when a parlay contains a podium leg (you confirmed: keep it).

Drop the same-athlete-in-same-slot check in this same trigger per your answer (you didn't tick "keep same-athlete block"). Removing the `v_dup_exists` IF/RAISE branch.

## 2. Frontend — `src/components/ParlayBuilder.tsx`

- Re-enable the `podium` and `highestScore` steps in `getAvailableSteps()` so they appear in the Continue flow for any leg whose discipline+gender has those markets.
- For **Podium**: when the user picks 1-2-3, store the result as a single synthetic selection on the leg whose `decimal_odds` = `resolvePodiumOrderedMultiplier(market, athleteIds)` (the override-aware combined multiplier already used outside parlays). This is what makes podium count as **one leg = combined multiplier** rather than three sub-multipliers stacked — directly per your answer.
- For **Highest Score**: each picked athlete becomes one leg-multiplier as it does for WINNER today.
- Per-leg the user can mix: e.g. one leg = just Winner, another leg = just Podium (combined), another leg = just Highest Score, another leg = Winner + Podium + Highest combined for the same discipline+gender (already supported).
- Remove the "Continue to Podium / Continue to Highest" gating that I shipped last turn now that those steps are eligible.

## 3. Frontend — `src/utils/parlayMultipliers.ts`

Per your answers (you did **not** keep "8-leg max" or "progressive caps"):

- Remove `MAX_PARLAY_LEGS` rejection — accept any leg count.
- Remove `PARLAY_CAPS` cap-by-leg-count — multiplier is `rawProduct × 0.75`, floored at 1.0, no ceiling.
- Keep `PARLAY_HAIRCUT = 0.75` and `PARLAY_FLOOR = 1.0`.

Adjust `calculateRawParlayMultiplier` so that when a leg has a `podium` populated, it uses the **combined podium multiplier** (single number from `podiumMultipliers.resolvePodiumOrderedMultiplier`) rather than multiplying first×second×third individually.

Update `getParlayMultiplierDetails` and `getMultiplierSuggestions` to drop the cap/disabled language.

## 4. Submission path — `src/components/ParlayBuilder.tsx` `handleSubmit`

When building the rows inserted into `predictions` for a parlay slip:
- Podium leg → insert with `selection_id = '<market_id>-podium'` and `market_type='PODIUM'`, the same shape as a standalone podium prediction. The new trigger lets it through; settlement code (`settle-predictions`) already handles the `-podium` selection_id for combined exact-order payouts.
- Highest Score leg → standard `selection_id = <selection.id>` row, `market_type='HIGHEST_SCORE'`. Settlement already handles it.

## 5. UI clean-up

- Update Summary card to show a single combined multiplier per podium leg (e.g. "Podium 1-2-3: 7.0x") instead of three separate rows.
- Drop the "max 8 legs / cap reached" copy from `getMultiplierSuggestions`.

# What I will NOT touch

- `enforce_podium_single_stake_cap` (kept — 1000-token cap still applies on parlays containing podium).
- Edge function `settle-predictions` — it already knows how to settle each leg type.
- Multiplier cap source of truth (`multiplierCaps.ts`) for WINNER / PODIUM / HIGHEST_SCORE per-market — unchanged.
- The chalk concentration trigger on `bet_slips` (`enforce_chalk_concentration_cap`) — still active.

# Risk acknowledgement (you should see this)

You explicitly chose to drop the 8-leg cap, the progressive cap (15→130x), and the same-athlete-in-one-slot block. That means a 6-leg parlay mixing chalk podiums and chalk winners can produce very large multipliers; a single $100 entry can theoretically pay out hundreds of thousands of tokens. The 0.75 haircut, the 1000-token podium stake cap, and the existing chalk-concentration cap on the bet slip will still apply, but they are not equivalent to the progressive cap. If you want, I can leave the progressive cap in place at much higher numbers (e.g. 1000x) as a backstop — say the word and I'll add it back before merging.

# Technical files touched

- `supabase/migrations/<new>.sql` — alter `public.enforce_parlay_leg_rules`
- `src/components/ParlayBuilder.tsx`
- `src/utils/parlayMultipliers.ts`

# Verification before stopping

- Reload preview, build a parlay: men's slalom Winner + men's slalom Podium + women's slalom Highest Score + men's jump Winner. Confirm it submits, ledger row appears, Summary multiplier matches `winnerOdds × podiumCombined × highestOdds × winnerOdds × 0.75`.
- Confirm a podium-only 1-leg parlay rejects if stake > 1000 (cap still bites).
- Confirm settlement edge function still picks it up (read `predictions` rows; no schema change to that table).

Stop after that — no email/push/notification triggered (no code path emits them on parlay placement).