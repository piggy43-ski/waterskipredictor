
# Rabat Settlement Execution Plan

I'm in plan mode and need your approval to switch to build mode before I can fire the writes/POST. Approving this plan is the green-light.

## Execution sequence

### Step 1 — Write `tournament_results` (all 35 athletes, 4 buckets)

Insert one row per athlete per discipline×gender bucket with Path A ranks:
- M Slalom: Winter=1, Ross=2, Asher=3, then 4..N
- M Tricks: Abelson=1, then official IWWF order
- W Slalom: Bull=1, then official order
- W Tricks: official order

`tournament_results_auto_flags` trigger handles `no_score`, `made_finals`, and discipline-specific column normalization. No `market_results` writes — engine doesn't read it for win/loss; this is purely for the post-settlement athlete stats learning at `settle-predictions/index.ts:1268`.

### Step 2 — POST `settle-predictions` (single atomic run)

One invocation, payload contains:
- `tournament_id`: `dad9b595-...`
- `tournament_name`: "Royal Nautique Pro - Rabat"
- `selections`: 120 entries (one per market_entry, marked won/lost)
- `prediction_overrides`: 22 PODIUM predictions force-marked LOST (no exact-order match)

Capture returned `settlement_run_id`. Single run ID covers all 12 markets + all parlays — required for `reverse_settlement(p_run_id)` if anything goes sideways.

### Step 3 — If POST fails or returns partial

Immediately call `reverse_settlement(p_run_id := <captured>, p_reason := 'rabat_settle_failed_<detail>')` and ping you before any retry. Do not attempt re-fire.

### Step 4 — Reconciliation report

Run as a batch of read-only queries and return a single consolidated report:

**A. Pattern A confirmation (idempotent re-check)**
- 4 Travis slips still `CANCELLED`, predictions `VOID`
- Travis wallet shows +1,850 refund txns intact, no double-refund

**B. Per-market singles (12 markets)**
For each market: `wins_count`, `losses_count`, `stake_total`, `payout_total`, `house_pnl = stake - payout` (singles only, exclude parlay legs by joining `bet_slips.type='single'`)

**C. Per-parlay outcomes**
All 18 PENDING parlays (excluding 4 Pattern A CANCELLED): confirm `status = 'LOST'`, list slip_id / user / stake / leg_count / which leg(s) lost. Expect: every parlay has ≥1 PODIUM leg, all lost.

**D. Aggregate house P&L**
`SUM(stake) - SUM(actual_payout)` across all Rabat slips settled in this run. Expect +8.5K to +10K.

**E. Largest single payout**
Top slip by `actual_payout_tokens` — confirm Boatntony, M Tricks WINNER, Abelson, stake 1000, mult 2.25, payout 2250.

**F. Ledger sanity (the non-negotiable equality)**
```
SUM(token_transactions.amount WHERE affects_wallet=true 
    AND settlement_run_id = <captured>)
  ==
SUM(wallet delta for users touched by this run, 
    computed from before/after via audit_logs on token_wallets)
```
If these don't match, STOP, do not send Travis email, call `reverse_settlement`, ping you.

**G. Specific call-outs you flagged**
- W Slalom WINNER house P&L on Bull (1.2×) predictions — should be near-flat / slightly negative on Bull, offset by losers. Flag if strongly positive (would indicate Bull credits missing).
- Confirm exactly ONE `settlement_run_id` stamps all 12 markets + 18 parlays.

### Step 5 — Hold Travis Resend email

Do not fire any email. Wait for your green-light after you review the reconciliation report.

## Risk / reversibility

`reverse_settlement(p_run_id, p_reason)` is the single rollback lever. Works on the captured run ID, writes compensating `*_reversal` ledger rows with `affects_wallet` mirrored, clamps wallet to ≥0 with audit_logs `SETTLEMENT_REVERSAL_OVERDRAW` if applicable, flips slips back to PENDING.

## What I will NOT do

- No `market_results` writes (not read by engine).
- No direct `token_wallets` UPDATEs — all wallet movement goes through `settle-predictions` atomic path. (May-3 rule respected.)
- No Travis email.
- No retry on failure without your ping.

Approve to switch to build mode and fire.
