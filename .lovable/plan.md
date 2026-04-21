

# Settle Swiss Pro Tricks (T-26USA010) — All 3 Rounds

Insert per-round scores from the IWWF results screenshots into `tournament_results` (R1=qualifying, R2=semifinal, R3=final), then settle all 29 pending bet slips.

## Round Mapping

- **Round 1 → `round_type = 'qualifying'`**
- **Round 2 → `round_type = 'semifinal'`**
- **Round 3 → `round_type = 'final'`**

Each athlete gets one row per round they actually skied (no row when the round cell is blank).

## Open Men Tricks

| Rank | Athlete | R1 (Quali) | R2 (Semi) | R3 (Final) |
|---|---|---|---|---|
| 1 | Gonzalez Matias | 11,310 | 12,840 | 12,860 |
| 2 | Abelson Jake | 12,400 | 12,620 | 12,720 |
| 3 | Labra Martin | 12,110 | 12,140 | 12,490 |
| 4 | Font Patricio | 12,590 | 11,940 | 12,010 |
| 5 | Poland Joel | 11,610 | 11,050 | 11,390 |
| 6 | Marenzi Edoardo | 9,320 | 10,250 | 10,480 |
| 7 | Font Pablo | 9,940 | 10,140 | 10,390 |
| 8 | Pickos Adam | 9,000 | 10,940 | 9,930 |
| 9 | Kuhn Dominic | 7,970 | 8,670 | — |
| 10 | Elias Adrian | 6,480 | 7,970 | — |
| 11 | Krueger Ridge | 1,960 | 6,430 | — |

## Open Women Tricks

| Rank | Athlete | R1 (Quali) | R2 (Semi) | R3 (Final) |
|---|---|---|---|---|
| 1 | Lang Erika | 11,310 | 11,610 | 10,980 |
| 2 | Ross Neilly | 10,550 | 10,550 | 10,550 |
| 3 | Hansen Kennedy | 9,130 | 8,320 | 9,580 |
| 4 | Abelson Alexia | 7,760 | 8,940 | 9,490 |
| 5 | Stopnicki Hannah | 7,620 | 8,100 | 8,580 |
| 6 | Hunter Anna | 9,540 | 10,190 | 5,610 |
| 7 | Danisheuskaya Aliaksandra | 6,960 | 7,380 | — |
| 8 | Gay Ella | 5,040 | 5,150 | — |

## Highest Score Settlement (best round across R1/R2/R3)

- **Open Women** → Lang Erika (11,610, R2)
- **Open Men** → Gonzalez Matias (12,860, R3)

## Steps

1. **Insert tournament_results** for `tournament_id = 7bf0f645-54f5-497a-9b95-208c01fb9609`, discipline `trick`:
   - 11 men × 3 rounds − 3 missing finals = **30 men rows**
   - 8 women × 3 rounds − 2 missing finals = **22 women rows**
   - Total: **52 rows**, with `final_overall_rank` set on every row, `raw_score` per round (auto-fills `trick_points`), `made_finals` auto-derived (true for athletes with a Round 3 row).
2. **Run `settle-predictions`** for all 6 markets:
   - **WINNER** → Gonzalez (M) / Lang (W)
   - **PODIUM (exact order)** → Men {1 Gonzalez, 2 Abelson, 3 Labra}; Women {1 Lang, 2 Ross, 3 Hansen}
   - **HIGHEST_SCORE** → MAX(raw_score) across rounds → Gonzalez 12,860 / Lang 11,610
3. **Mark tournament settled** — `tournaments.settled_at = now()`, `status = 'completed'` (auto-clears `market_liability`).
4. **Verify** — all 29 PENDING slips → WON/LOST, `settlement_metadata` populated, wallets credited, liability cleared.

## Technical Details

- Statuses stay UPPERCASE per project rules.
- `tournament_results_auto_flags` trigger handles `trick_points`, `made_finals`, `no_score`.
- Settlement runs in a single batch (29 slips, well under chunk limits).
- All 19 athlete UUIDs already reconciled to the `athletes` table.
- Tournament Recap admin page will now display Quali / Semi / Final tabs with per-round scores.

## Out of Scope

- Athlete rating updates (separate `update-ratings-from-results` action — can run after on request).
- Future-tournament odds generation.
- Fantasy pot settlement (none active for this trick-only event).

