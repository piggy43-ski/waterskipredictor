# CLAUDE.md

Project notes for Claude / Lovable agents.

## Known Issues / Backlog

## Known Issue — prediction_lost ledger semantics (logged 2026-05-04)

`prediction_lost` rows in `token_transactions` carry real negative amounts (-1 to -1000), totaling -21,397 across 176 rows. Same pattern for legacy `bet_lost` (-2,102 / 27 rows). The Step 1 audit assumed losses don't debit the wallet because the stake was taken at entry. That assumption is wrong or incomplete.

Two possibilities:
- Real debits → users charged twice when they lose. House gains. User-trust risk.
- Cosmetic-only → ledger lies about wallet movements. Reconciliation is wrong.

Investigation needed: trace settle-predictions L637 and L849, cross-check against historical token_wallets balances for 5 sample users with prediction_lost rows. Must be resolved before public launch.