

## Update Trick Rankings from IWWF + Adjust Multipliers

### Current vs IWWF Rankings Comparison

**Men's Trick (athletes in tournament):**
| Athlete | DB Rank | IWWF Rank | Change | Current Multiplier |
|---------|---------|-----------|--------|-------------------|
| Gonzalez Matias | 3 | **1** | ↑2 | 4.80x (override) |
| Abelson Jake | 1 | **2** | ↓1 | 2.60x (override) |
| Font Patricio | 2 | **3** | ↓1 | 4.00x (override) |
| Labra Martin | null | **4** | new | 20.0x (override) |
| Poland Joel | 5 | **6** | ↓1 | 12.0x (override) |
| Llewellyn Dorien | 8 | **9** | ↓1 | 15.0x (override) |
| Pickos Adam | 9 | **10** | ↓1 | 20x |
| Marenzi Edoardo | 11 | **12** | ↓1 | 20x |
| Font Pablo | 12 | **13** | ↓1 | 18.0x (override) |
| Kuhn Dominic | 17 | **16** | ↑1 | 20x |
| Elias Adrian | null | **29** | new | 20.0x (override) |
| Krueger Ridge | null | **93** | new | 20.0x (override) |

**Big change**: Gonzalez Matias is now world #1, Abelson Jake drops to #2. Since Gonzalez is the defending champ AND now world #1, his multiplier should drop significantly. Abelson should also adjust.

**Women's Trick**: The IWWF site didn't render the women's section via static fetch (requires JavaScript filter). Rankings stay as-is unless you can tell me the updated women's rankings.

### Plan

#### 1. Update `current_rank_trick` in athletes table
Update all men's trick athletes with their new IWWF world rankings.

#### 2. Adjust multipliers based on new rankings
Since Gonzalez Matias is now world #1 (was #3), his multiplier needs to come down. Suggested new multipliers based on new rankings:

| Athlete | New Rank | Suggested Multiplier | Reasoning |
|---------|----------|---------------------|-----------|
| Gonzalez Matias | 1 | **2.5x** | Now #1 + defending champ |
| Abelson Jake | 2 | **3.5x** | Dropped to #2 |
| Font Patricio | 3 | **5.0x** | Dropped to #3 |
| Labra Martin | 4 | **8.0x** | Now ranked #4 (was unranked), but injury flag stays |
| Poland Joel | 6 | **12.0x** | Keep at 12x |
| Llewellyn Dorien | 9 | **15.0x** | Keep at 15x |
| Pickos Adam | 10 | **18.0x** | Was 20x, rank 10 |
| Marenzi Edoardo | 12 | **20.0x** | Keep |
| Font Pablo | 13 | **18.0x** | Keep |
| Kuhn Dominic | 16 | **20.0x** | Keep |
| Elias Adrian | 29 | **20.0x** | Keep |
| Krueger Ridge | 93 | **20.0x** | Keep |

**Note**: Labra Martin moving from unranked to world #4 is a big deal — dropping from 20x to 8x reflects that (even with injury). Want me to adjust differently?

#### 3. Update `market_multiplier_overrides`, `market_odds`, and `selections` tables
Sync all three tables for consistency.

#### 4. Women's rankings
The IWWF site requires JavaScript rendering to load the women's filter. I couldn't get the women's trick rankings from the static page fetch. Do you want to:
- Tell me the women's rankings manually?
- Keep women's rankings as-is for now?

### Files Changed
No code file changes — all database updates via insert/update tool.

