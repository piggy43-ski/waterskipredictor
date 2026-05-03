## Swiss Pro Slalom 2026 — Settlement Plan

### Final Results (confirmed reading)

**Men's Podium** (3-way tie at 1@9.75, ordered per result sheet):
1. 🥇 Charlie Ross (CAN)
2. 🥈 Nate Smith (USA)
3. 🥉 Frederick Winter (GBR)

**Women's Podium**:
1. 🥇 Regina Jaquess (USA) — 1.5@10.25
2. 🥈 Jaimee Bull (CAN) — 1@10.25
3. 🥉 Allie Nicholson (USA) — 3@10.75

**Men's High Score:** TIE at 1@9.75 → **Ross, Smith, AND Winter all WIN** (per your tie rule)
**Women's High Score:** Regina Jaquess (outright)

**Men's Finalists (Top 8, R3 score):** Ross, Smith, Winter, Mechler, Asher, Neveu, Travers, Hazelwood
**Women's Finalists (Top 6, R3 score):** Jaquess, Bull, Nicholson, N. Ross, Garcia, Montavon

---

### Step 1 — Insert tournament_results

Insert one row per skier into `tournament_results` for slalom/men + slalom/women with `final_overall_rank`, `buoys`, `line_length_m`, `made_finals`. Trigger auto-handles `no_score` and `made_finals` flags.

### Step 2 — Insert market_results

For the 6 markets:
- **Men WINNER** → Ross
- **Men PODIUM** → Ross (1), Smith (2), Winter (3)
- **Men HIGHEST_SCORE** → Ross + Smith + Winter (all 3 marked as final_rank=1, tie)
- **Women WINNER** → Jaquess
- **Women PODIUM** → Jaquess (1), Bull (2), Nicholson (3)
- **Women HIGHEST_SCORE** → Jaquess

### Step 3 — Settle bet_slips (single bets)

Direct UPDATE per slip. Set `status`, `actual_payout_tokens`, `settled_at`. Trigger `cleanup_liability_on_settlement` and `audit_bet_slip_changes` fire automatically.

**Men WINNER market** — Ross wins:
- WON: all bets on Ross (Conleypinette, WaterskiNation, hannahstopnicki, Mati González, Bsmogard, Jakechambers, Jbolan, BallOfSpray 2.5K, Pinner69, Tincholabra, CamiPhoto, Jacobsen916 + others)
- LOST: bets on Smith (PatM, Pablo Alvira), Mechler (WaterskiNation), and any other non-Ross picks

**Men PODIUM market** — winner = bets on Ross/Smith/Winter
- WON: bets on Ross, Smith, or Winter
- LOST: bets on anyone else

**Men HIGHEST_SCORE market** (3-way tie rule):
- WON: Ross (BallOfSpray 500@3.0), Ross (Boatntony 100@3.0), Smith (piggy43 500@2.5)
- LOST: any other picks

**Women WINNER** — Jaquess:
- WON: hannahstopnicki on Jaquess, Samson Clunie on Jaquess (4K), and others
- LOST: Nathan on Bull, anyone on others

**Women PODIUM** — winners are Jaquess/Bull/Nicholson:
- WON: bets on those 3
- LOST: rest

**Women HIGHEST_SCORE** — Jaquess only

### Step 4 — Settle parlays

Parlay legs live in `parlay_markets.legs` (jsonb). For each pending parlay slip:
- Look up its parlay_markets row → read each leg's market_id + athlete_id
- Resolve each leg against `market_results`
- ALL legs must WIN → slip WON; any LOST → slip LOST
- Update bet_slip status + actual_payout_tokens

### Step 5 — Settle Fantasy Pot

Pot: **"Swiss Pro Slalom 2026"** (id `f0e604b1...`), entry fee 100 tokens, payout 50/30/20.

**Scoring rules** (from `mem://fantasy-scoring/rules-and-points`):
- Points by final placement (1st=highest, decreasing)
- Made-finals bonus
- **Highest score bonus → awarded to Ross, Smith, AND Winter (all 3 tied) for men; Jaquess for women**

Two entries:
- **piggy43** roster: N. Ross, Hazelwood, Smith, Vieke, Mechler, Kretschmer, Nicholson, Bull, Travers, McCormick, Garcia, Poland
- **Travis Anderson** roster: Ross (Charlie), Degasperi, Poland, Jaquess, Garcia, Espinal, Kretschmer, Neveu (+ more)

Compute `points_earned` per athlete in `fantasy_entry_athletes`, sum into `fantasy_entries.total_points`, rank, then update pot status to `settled` and credit winner(s) per 50/30/20 split (only 2 entries → likely 1st/2nd only get paid, or full pot to 1st depending on policy — will use top_3_split proportionally to entrant count).

Insert `fantasy_scoring_events` rows with breakdown jsonb so users see per-athlete points.

### Step 6 — Token wallet credits

For each WON slip and fantasy payout:
- Increment `token_wallets.earned_tokens` by `actual_payout_tokens`
- Insert `token_transactions` row (type=`prediction_won` / `fantasy_payout`)
- Use `Math.floor` on all amounts

### Step 7 — Notifications

Insert `notifications` rows for each settled user (WON / LOST / fantasy result) with link back to predictions page.

### Step 8 — Update tournament status

`UPDATE tournaments SET status = 'COMPLETED' WHERE id = '76329f1b...'`

---

### Technical notes
- All status values UPPERCASE (`WON`, `LOST`, `SETTLED`, `COMPLETED`)
- All payouts via `Math.floor()`
- Use the existing `settle-predictions` edge function payload shape — it accepts a `selections` array with `selection_id` + `result`. Will build the payload from `market_results` + bet_slips, then call it.
- Tie handling for Men's High Score: pre-mark all 3 winners' bets as `won=true` in the override array before invoking settle-predictions, so it pays all three groups.
- Parlays settled in a follow-up SQL pass since the edge function is selection-keyed.

### What you'll see when done
- All ~50 bet_slips moved out of PENDING
- Charlie Ross winner-bettors paid at 2.8x
- All 3 Men's High Score bettors paid (Ross 3.0x, Smith 2.5x)
- Jaquess winner-bettors paid at 2.5x
- Nathan's Bull-to-win bet → LOST
- BallOfSpray's Poland 16x moonshot → LOST
- Fantasy pot settled with rankings + payouts
- Tournament marked COMPLETED

Reply **"approve"** to execute.
