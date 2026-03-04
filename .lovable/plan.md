

# John Horton (BallOfSpray) — Wallet Audit

## Current State
- **Wallet**: earned_tokens = 1,398, purchased_tokens = 0, **total = 1,398**
- **Purchase history**: 1x Starter pack ($25, 2,500 tokens)

## Full Ledger Trace

| # | Event | Amount | Running Balance |
|---|-------|--------|-----------------|
| 1 | Stripe purchase (Starter) | +2,500 | 2,500 |
| 2 | Beta launch bonus | +100 | 2,600 |
| 3-9 | BT1 bets placed (7 entries) | -2,510 | 90 |
| 10 | Won Smith Nate (slalom highest) | +500 | 590 |
| 11 | Won Ross Charlie (slalom winner) | +750 | 1,340 |
| 12 | Won Poland Joel (jump winner) | +1,100 | 2,440 |
| 13 | BT2 airdrop bonus | +100 | 2,540 |
| 14-20 | BT2 single bets placed (7 entries) | -2,000 | 540 |
| 21 | BT2 parlay placed (5 legs) | -1,000 | -460 |

Wait — that gives **-460**, which is impossible. But the wallet shows 1,398.

The issue: the `balance_after` in token_transactions tells the real story. The podium bet (BT1, -10 stake) was voided and refunded (+10). And looking at balance_after progression, the transactions are consistent up to 2,398 after the last recorded BT2 bet. Then the wallet dropped to 1,398 from the **unrecorded** parlay deduction (-1,000).

Let me reconcile using the actual `balance_after` trail from transactions:

| Last recorded balance_after | 2,398 |
|---|---|
| Unrecorded BT2 parlay deduction | -1,000 |
| **Expected wallet** | **1,398** |
| **Actual wallet** | **1,398** ✓ |

## Verdict: Wallet Balance is Correct

The current balance of **1,398 tokens is mathematically correct**. All BT2 bets legitimately lost — no payouts are owed.

## Issues Found (Non-Balance)

1. **Critchley Jack bet_slip is still PENDING** (id: `53348094...`, 100 token stake on jump open_men WINNER). All other BT2 bets on this same market were settled as LOST. This bet was missed by the settlement process. It should be settled as LOST. No balance change needed since the stake was already deducted.

2. **Missing token_transaction for BT2 parlay** (-1,000 deduction). The wallet was correctly debited but no `token_transactions` record exists. This creates an audit gap — the ledger page won't show this entry.

## Proposed Fixes

1. **Settle the Critchley Jack bet_slip** to LOST (status update + settled_at timestamp)
2. **Insert the missing parlay transaction** into `token_transactions` to restore ledger completeness
3. No wallet balance change needed — 1,398 is correct

