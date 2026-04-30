
## Update Swiss Pro Slalom Men's Multipliers & Rankings

### Problem
- Charlie Ross is skiing near world-record level, so he and Nate Smith should be very close favorites (not 3.0x vs 5.0x)
- The rest of the field is clumped at 20x with no differentiation
- Tornquist Tim has no proper ranking/rating

### Changes

#### 1. Update Tim's athlete rating
Set `current_rating_slalom` to ~78 (mid-tier European pro) so the engine treats him correctly.

#### 2. Update multipliers across all 3 men's markets (WINNER, PODIUM, HIGHEST_SCORE)

**WINNER market** (19 athletes) — smooth curve from favorites to longshots:

| Rank | Athlete | Multiplier |
|------|---------|------------|
| 1 | Smith Nate | 2.30x |
| 2 | Ross Charlie | 2.80x |
| 3 | Asher William | 5.00x |
| 4 | Winter Frederick | 6.00x |
| 5 | Degasperi Thomas | 7.00x |
| 6 | Hazelwood Robert | 8.00x |
| 7 | Mccormick Cole | 9.00x |
| 8 | Travers Jonathan | 10.00x |
| 9 | Mechler Dane | 11.00x |
| 10 | Palomino Blanch Jaime | 12.00x |
| 11 | Tornquist Tim | 13.00x |
| 12 | Dailland Thibaut | 14.00x |
| 13 | Sedlmajer Adam | 15.00x |
| 14 | Poland Joel | 16.00x |
| 15 | Calhoun Jamie | 17.00x |
| 16 | Stadlbaur Benjamin | 18.00x |
| 17 | Neveu Stephen | 19.00x |
| 18 | Attensam Nikolaus | 20.00x |
| 19 | Belmrah Kamil | 20.00x |

**PODIUM market** — compressed multipliers (easier to hit top 3):

| Athlete | Multiplier |
|---------|------------|
| Smith Nate | 1.50x |
| Ross Charlie | 1.70x |
| Asher William | 2.50x |
| Winter Frederick | 3.00x |
| Degasperi Thomas | 3.50x |
| Hazelwood Robert | 4.00x |
| Mccormick Cole | 4.50x |
| Travers Jonathan | 5.00x |
| Mechler Dane | 5.50x |
| Remaining 10 | 6.00x down to smooth curve |

**HIGHEST_SCORE market** — similar to WINNER but slightly compressed.

#### 3. Sync `market_odds` and `selections` tables
Both `selections.decimal_odds` and `market_odds.final_decimal_odds` will be updated to match.

#### 4. Update `market_odds.athlete_rank` to reflect new ordering
Nate = rank 1, Charlie = rank 2, etc.

### Technical Details
- Direct SQL updates via migration on `selections`, `market_odds` tables
- Update `athletes.current_rating_slalom` for Tornquist Tim
- All 3 market IDs: WINNER (`86170dbb`), PODIUM (`c7964561`), HIGHEST_SCORE (`465d688a`)
