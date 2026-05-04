## Root cause

The Swiss Pro Slalom 2026 manual settlement updated `bet_slips` via `EXISTS market_results` joined on `market_id`. **PODIUM single bets have `market_id IS NULL`** (the 3-athlete pick lives in `predictions.athlete_name` like `"Podium: Jaquess Regina, Bull Jaimee, Nicholson Allie"`), so every podium single was silently marked LOST and their `predictions` rows left as PENDING.

User reports map cleanly to this bug:
- **User 2 = SkiLucas🤙** — picked women's podium in **exact actual order** (Jaquess/Bull/Nicholson) on **two slips**. Both wrongly LOST.
- **User 1 ("won 8850")** — best fit is **Boatntony** (true total 8,030 across 5 slips: 300+2,600+2,480+1,250+1,400). Could also be Max (9,600). Either way the missing payout is from the same podium bug.

Actual results (already in `market_results`):
- Men podium: 1 Ross, 2 Smith, 3 Winter
- Women podium: 1 Jaquess, 2 Bull, 3 Nicholson
- Men HIGHEST_SCORE: 3-way tie Ross/Smith/Winter

## Settlement rules (per memory)

- Single PODIUM = strict exact-order match.
- Parlay PODIUM leg (single athlete, market_type=PODIUM) = "to finish top 3".
- `total_odds_decimal` is already capped at 15 on parlays.
- All payouts via `Math.floor()`, all statuses UPPERCASE, soft updates only.
- Notifications must be neutral — no mention of bug/error/limits.

## Slips to fix

**PODIUM singles → flip LOST → WON:**

| User | Slip | Pick | Payout |
|---|---|---|---|
| SkiLucas🤙 | b567c940 | Jaquess, Bull, Nicholson | 1,300 |
| SkiLucas🤙 | b8b35328 | Jaquess, Bull, Nicholson | 1,300 |
| Boatntony | cead994d | Jaquess, Bull, Nicholson | 2,600 |
| Boatntony | d6562bf2 | Ross, Smith, Winter | 2,480 |
| Max | bd06a7fb | Ross, Smith, Winter | 6,200 |
| hannahstopnicki | dac6a38c | Ross, Smith, Winter | 1,240 |

**PODIUM singles → stay LOST** (wrong order): WaterskiNation, Bsmogard (both Bull/Jaquess/Nicholson — 1st/2nd swapped), piggy43 (Smith/Ross/Asher).

**Parlays → re-evaluate** (verify each leg before flipping; expected all-legs-win → WON at stake×15):
- bretellis (250) → 3,750
- JakeGlazer2 (100) → 1,500
- Jedgell (100) → 1,500
- Jaeden_Eade 8946 women (100) → 1,500
- Travis Anderson a661 men (50) → 750
- Travis Anderson d9cd women (50) → 750
- Jaeden_Eade 97fc → stays LOST (Smith WINNER leg lost)

## Steps

1. Run a verification query to print the full diff (slip_id, user, current_status, correct_status, correct_payout) so you can sanity-check before any write.
2. `UPDATE bet_slips SET status='WON', actual_payout_tokens=<floor>, settled_at=now()` for each fixed slip.
3. `UPDATE predictions SET status='WON', payout_tokens=<floor>, settled_at=now()` for the matching rows so user UIs reflect the win.
4. Credit each user's wallet via `increment_earned_tokens(user_id, payout)` and insert a `token_transactions` row of type `bet_won` for each fixed slip.
5. Insert one neutral `notifications` row per affected user: *"Your Swiss Pro Slalom entry has been updated and your reward has been credited."* linking to `/profile?tab=predictions`.
6. Run `SELECT rebuild_market_liability()` at the end to keep liability counters consistent.
7. Insert a single `audit_logs` row (`actor_type='admin'`, `action_type='SETTLEMENT_CORRECTION'`, `entity_type='tournament'`, `entity_id='76329f1b…'`) with the full diff in `metadata`.
8. Re-query and report back: per-user totals credited, list of affected slips, confirmation that no PODIUM slip remains in an inconsistent state.

## Notes

- No code changes — pure data correction.
- Will not touch already-correct LOST slips or already-WON singles.
- Will DM-friendly summary at the end so you can copy/paste replies to SkiLucas🤙 and the other user.