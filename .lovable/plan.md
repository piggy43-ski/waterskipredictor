

# Comprehensive Cleanup: Rebrand from "Betting" to "Predicting" Everywhere

## The Root Problem

The codebase was originally built as a betting platform and still carries that DNA everywhere -- variable names, comments, transaction types, edge function logic, and even the component folder is called `betting/`. This is why:

1. The AI keeps getting confused and treats things as "bets"
2. Settlement logic uses terms like `bet_slip`, `bet_won`, `bet_lost`, `bet_void`
3. Comments throughout the code reference "bets" and "betting slips"

The database table is still called `bet_slips` (renaming live tables is risky), but **every code reference** should use prediction/entry terminology.

## Files That Need Changes

### Frontend (10 files)

| File | What Changes |
|------|-------------|
| `src/pages/Predictions.tsx` | Comments still say "bet_slips table". Import path references `betting/` |
| `src/pages/Index.tsx` | Comments say "bet_slips", variable names |
| `src/pages/Profile.tsx` | Comments say "bet_slips" |
| `src/pages/TournamentDetailClean.tsx` | Variables named `betSlip`, comments say "bet_slips" |
| `src/pages/admin/TournamentSettlement.tsx` | Comments reference "bet_slips", "parlays query bet_slips" |
| `src/pages/admin/RiskDashboard.tsx` | References to bet_slips in comments |
| `src/pages/admin/AuditLogs.tsx` | Event types: `BETSLIP_SETTLED` -> `ENTRY_SETTLED`, entity type `betslip` -> `entry` |
| `src/components/ParlayBuilder.tsx` | Comments say "Create bet slip", "bet_slip level", variable `betSlip` -> `entry` |
| `src/components/admin/SettlementAuditTable.tsx` | Variables `betSlipIds`, `betSlipMap`, `betSlip`, comments |
| `src/components/betting/SettlementExplanation.tsx` | **Rename folder** from `betting/` to `settlement/` |

### Edge Functions (3 files)

| File | What Changes |
|------|-------------|
| `supabase/functions/settle-predictions/index.ts` | Transaction types: `bet_won` -> `prediction_won`, `bet_lost` -> `prediction_lost`, `bet_void` -> `prediction_void`. Comments: "bet_slip settlement" -> "entry settlement". Variables: `betSlipsToSettle` -> `entriesToSettle` |
| `supabase/functions/validate-bet/index.ts` | Rename function? At minimum, update all internal comments and variable names |
| `supabase/functions/run-settlement-test/index.ts` | Comments say "Single bet placed", "Parlay bet placed". Variable `singleBetSlipId` -> `singleEntryId` |

### What We Are NOT Changing
- The database table name `bet_slips` stays as-is (too risky to rename on a live app)
- The column `bet_slip_id` in the `predictions` table stays
- The Supabase auto-generated `types.ts` stays (it mirrors the DB)
- We keep `from('bet_slips')` in queries since that's the actual table name -- but wrap them in clearly-named functions/comments

## Implementation Order

1. Rename `src/components/betting/` folder to `src/components/settlement/` and update all imports
2. Update all frontend files (comments, variable names, user-facing strings)
3. Update edge functions (transaction types, comments, variable names)
4. Deploy edge functions

## What This Prevents Going Forward

- The AI will stop seeing "bet" language in the codebase and won't revert to gambling terminology
- New features built on top of this code will naturally use "prediction/entry" language
- Transaction types in the database will use `prediction_won` instead of `bet_won`, making audit logs clearer

