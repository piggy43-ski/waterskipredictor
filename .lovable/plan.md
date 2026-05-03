
# Settle Swiss Pro Slalom 2026 — final plan

## Verified results (from IWWF)

**Men finals (top 8):**
1. Charlie Ross — 1 @ 9.75
2. Nate Smith — 0.5 @ 9.75
3. Frederick Winter — 5 @ 10.25
4. Dane Mechler · 5. William Asher · 6. Stephen Neveu · 7. Jonathan Travers · 8. Robert Hazelwood

**Women finals (top 6):**
1. Regina Jaquess — 1.5 @ 10.25
2. Jaimee Bull — 4 @ 10.75
3. Allie Nicholson — 3 @ 10.75
4. Neilly Ross · 5. Alexandra Garcia · 6. Elizabeth Montavon

## Market resolution

| Market | Winner(s) |
|---|---|
| Men WINNER | Charlie Ross |
| Men PODIUM (1/2/3) | Ross / Smith / Winter |
| **Men HIGHEST_SCORE** | **Ross + Smith + Winter (3-way tie per your call)** — all bettors who picked any of the three WIN |
| Women WINNER | Regina Jaquess |
| Women PODIUM (1/2/3) | Jaquess / Bull / Nicholson |
| Women HIGHEST_SCORE | Regina Jaquess (only woman to clear 10.25) |

## Bet impact of the high-score tie

The 3 men HIGHEST_SCORE bets are:
- piggy43 — Smith @ 2.5x → **WIN 1,250** (was going to lose)
- BallOfSpray — Ross @ 3.0x → **WIN 1,500**
- Boatntony — Ross @ 3.0x → **WIN 300**

No one bet Winter for high score, so the tie rule mainly rescues piggy43.

## Execution

1. Open `/admin/tournament-settlement`, load Swiss Pro, paste the IWWF results.
2. **Manually mark the men HIGHEST_SCORE market with all 3 winners** (Ross, Smith, Winter) — I'll do this by inserting 3 rows into `market_results` for that market_id, all with `final_rank = 1`. The `settle-predictions` edge function already treats any athlete in `market_results` for a HIGHEST_SCORE market as a winner.
3. Show the preview (per-bet breakdown) — you confirm.
4. Run settlement: writes `tournament_results`, `market_results`, updates `bet_slips` (WON/LOST + Math.floor payouts), credits `token_wallets`, runs `settle-fantasy-pot` (2 entries, pot = 200, rake 10% → 60/40 split: 1st = 108, 2nd = 72), inserts `notifications`, sets tournament `COMPLETED`.
5. Verification query showing settled counts, total payouts, fantasy standings.

All status UPPERCASE, all payouts `Math.floor()`, soft updates only, neutral notifications.

**Approve and I'll run it.**
