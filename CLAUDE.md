# CLAUDE.md

Project notes for Claude / Lovable agents.

## Known Issues / Backlog

## Known Issue — Shadow analysis script PODIUM handling (logged 2026-05-06)
The synthetic shadow analysis script joins predictions.selection_id → selections.id → market_odds.athlete_rank, which silently fails for PODIUM exact-order predictions whose selection_id is a synthetic composite (e.g. "<uuid>-podium"). These predictions use calculatePodiumCombinedMultiplier instead and are correctly priced in production. The shadow script underrepresents PODIUM in delta reports.

Fix when next running shadow analysis: branch on market_type='PODIUM' with composite selection_id and recompute via calculatePodiumCombinedMultiplier(r1, r2, r3) × 2, capped at MAX_PODIUM_COMBINED_MULTIPLIER (currently 25). Production engine and rank data are correct; this is a script limitation only.

## Known Issue — prediction_lost ledger semantics (logged 2026-05-04)

`prediction_lost` rows in `token_transactions` carry real negative amounts (-1 to -1000), totaling -21,397 across 176 rows. Same pattern for legacy `bet_lost` (-2,102 / 27 rows). The Step 1 audit assumed losses don't debit the wallet because the stake was taken at entry. That assumption is wrong or incomplete.

Two possibilities:
- Real debits → users charged twice when they lose. House gains. User-trust risk.
- Cosmetic-only → ledger lies about wallet movements. Reconciliation is wrong.

Investigation needed: trace settle-predictions L637 and L849, cross-check against historical token_wallets balances for 5 sample users with prediction_lost rows. Must be resolved before public launch.

## Known Issue — 16 prediction_won rows with null reference_id (logged 2026-05-05)
16 token_transactions rows from batch dated 2026-05-03 23:39:16 carry type='prediction_won' and reference_type='tournament_settlement' with reference_id=NULL. Created by an aggregate tournament-settlement payout, not per-slip crediting. Audit trail incomplete — wallet credits exist but cannot be linked back to specific predictions.

Pre-existing (not caused by 4C migration). Investigate jointly with prediction_lost ledger semantics finding. Consider:
- Should these reference settlement_run_id instead of reference_id?
- Was this a one-time aggregate fix, or does the producing code path still run?
- Backfill correct reference_ids if recoverable from audit_logs.

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