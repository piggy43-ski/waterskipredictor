# CLAUDE.md

Project notes for Claude / Lovable agents.

## Known Issues / Backlog

## V2 Priority #1 — Strength model rebuild from tournament results (logged 2026-05-20)
Current `base_strength_*` and `form_boost_*` fields on athletes are stale and don't reflect 2025-26 finishes (Worlds, Pro Tour, regional). This causes engine misprices like Gonzalez Matias being ranked field-#4 in trick when he's world-#1.

Rebuild plan:
- Nightly cron pulling from `athlete_results`, per discipline
- Weighted by tournament tier: Worlds 1.0 / Pro Tour 0.7 / Regional 0.4
- Trailing 90-day form boost with decay
- Write to `athletes.base_strength_{discipline}` and `athletes.form_boost_{discipline}`

Until rebuilt, use admin multiplier overrides at `/admin/multiplier-overrides` for known misprices (Gonzalez Matias in trick is the immediate example).

Architecture note: manual multiplier overrides live in the separate `market_multiplier_overrides` table and are layered on top of `market_odds` at read time. The auto regenerator writes to `market_odds` only, so manual overrides survive any regenerate sweep by design — no `is_manual_override` flag on `market_odds` is needed.

## Known Issue — Shadow analysis script PODIUM handling (logged 2026-05-06)
The synthetic shadow analysis script joins predictions.selection_id → selections.id → market_odds.athlete_rank, which silently fails for PODIUM exact-order predictions whose selection_id is a synthetic composite (e.g. "<uuid>-podium"). These predictions use calculatePodiumCombinedMultiplier instead and are correctly priced in production. The shadow script underrepresents PODIUM in delta reports.

Fix when next running shadow analysis: branch on market_type='PODIUM' with composite selection_id and recompute via calculatePodiumCombinedMultiplier(r1, r2, r3) × 2, capped at MAX_PODIUM_COMBINED_MULTIPLIER (currently 25). Production engine and rank data are correct; this is a script limitation only.

## RESOLVED 2026-05-07 — prediction_lost ledger semantics
Diagnosis: cosmetic ledger only (Scenario 2). `prediction_lost` rows do NOT decrement `token_wallets`; the stake was already debited at `entry_placed`. Users were never overcharged. Resolution: added `affects_wallet boolean` column to `token_transactions` (default true). All 203 historical `prediction_lost` rows backfilled to `affects_wallet=false`. New writes from `settle-predictions` (single L666 + parlay L962) include `affects_wallet: false`. View `v_wallet_ledger` (security_invoker) filters to wallet-affecting rows only — use it for reconciliation.

## RESOLVED 2026-05-07 — 16 prediction_won rows with null reference_id (logged 2026-05-05)
Backfilled with tournament reference and `backfilled` metadata flag. Source identified: aggregate catch-up payout from 2026-05-03 23:39 UTC for Swiss Pro Slalom (tournament `76329f1b-a36d-4232-b1f8-5ced4484fd4d`). Producer code no longer exists in codebase. 13/16 rows match per-user WON slip totals exactly; 3/16 are partial catch-ups (flagged in metadata.backfill_note). All 16 carry `affects_wallet=true` (real wallet credits).

## RESOLVED 2026-05-07 — May 3 catch-up wallet bug
Root cause: On 2026-05-03 23:39 UTC, a manual catch-up payout for Swiss Pro Slalom was performed via raw SQL inserts into `token_transactions` WITHOUT corresponding `token_wallets` UPDATEs. The ledger showed 16 `prediction_won` rows totaling 42,283 tokens (~$422.83), but no money reached the wallets.

Discovery: User Max Strilchuk reported missing 3,400 tokens via Instagram on 2026-05-07. Audit identified all 16 affected users (every catch-up row had `catchup_balance_after == prior_balance_after`, confirming wallet was never bumped).

Fix: Single atomic CTE statement on 2026-05-07 incremented all 16 affected wallets and inserted matching `adjustment` audit rows with `reference_type='admin'` and `metadata.correction_type='may_3_catchup_wallet_apply'`. Total corrected: 42,283 tokens / $422.83. Pre-snapshot total balance across 16 users: 33,715. Post: 75,998 (delta 42,283 ✓).

Affected users (in order of amount): Samson Clunie 10000, BallOfSpray 8500, Mati González 5300, piggy43 3750, Max 3400, Boatntony 2950, Jakechambers 1931, hannahstopnicki 1530, WaterskiNation 1400, Tincholabra 840, Conleypinette 571, Jbolan 571, Pinner69 560, Jacobsen916 420, CamiPhoto 280, Bsmogard 280.

Lesson learned: any future ledger insert that should affect a wallet MUST go through a single code path that updates both atomically. Manual SQL bypasses are forbidden going forward.

## Manual Audit Required — Stripe Dashboard (logged 2026-05-04)
Product names, descriptions, and price metadata live in the Stripe dashboard, not in the codebase. Receipts emailed to paying users render these strings verbatim. Audit and clean before public launch:
- Stripe Dashboard → Products → every product name + description
- Stripe Dashboard → Customer portal text
- Stripe Dashboard → Email branding / receipt headers
Replace any: bet, wager, odds, payout, cashout, bookie, sportsbook, gamble, gambling.

## Bake Period — 4C Legacy Enum Cleanup (started 2026-05-04)
Backfill complete. 403 rows migrated from `bet_*` to `prediction_*` / `entry_placed`.
Zero rows remain with legacy values. Reader fallbacks for legacy values are still in place in:
- src/pages/Transactions.tsx (icon switch + badge config)
- src/components/admin/UserAnalyticsDrilldown.tsx (color/label maps)
- supabase/functions/settle-predictions/_shared/idempotency.ts (credit type list)
- src/utils/settlement/idempotency.ts (mirror)
- public.reverse_settlement (SQL function body)

Drop migration prepared at: `supabase/migrations_drafts/20260505141609_drop_legacy_bet_enum.sql`
When ready to apply (after bake): move file back to `supabase/migrations/`, then `supabase db push`.

Bake until at least 2026-05-11. Before applying drop:
1. Re-run grep: zero writers of `bet_*` outside `_archive`
2. Confirm zero rows with `type IN ('bet','bet_placed','bet_won','bet_lost','bet_void')`
3. Confirm app has been used (entries created, settlements run) since 2026-05-04
4. Then: move file from `migrations_drafts/` to `migrations/`, `supabase db push`, remove reader fallbacks in a separate PR
## Configuration Decisions

### Cap Configuration (locked 2026-05-06)

Per-leg multiplier caps (multiplierCaps.ts):
- WINNER: rank 1 = 1.5x, rank 2 = 2.25x, rank 3 = 3.0x, rank 4 = 4.0x, rank 5 = 5.0x, market max = 8.0x
- PODIUM (per-leg): rank 1 = 1.25x, rank 2 = 1.75x, rank 3 = 2.25x, market max = 6.0x
- HIGHEST_SCORE: rank 1 = 1.8x, rank 2 = 2.5x, rank 3 = 3.5x, market max = 7.0x

Composite caps:
- PODIUM combined exact-order: 25x (raised from 18x to reflect 6x combinatorial difficulty)
- Parlay caps by leg count: {1:15, 2:20, 3:35, 4:50, 5:60, 6:80, 7:105, 8:130}, haircut 0.75
- MAX_PARLAY_LEGS: 8

Rationale: bankroll-conservative ceiling appropriate for current $304 cash position.
Revisit when bankroll exceeds $5,000 or after first 3 high-volume events post-launch.
