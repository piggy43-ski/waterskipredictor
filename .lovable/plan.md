

## Fix Natalia Cuglievan's Ranking Position

### The Problem

Natalia Cuglievan is currently ranked at **position 2** with a **6x multiplier** in the Women's Trick market, but she should be ranked **below Paige Rini** (World #6).

### Root Cause

Her tournament entry has `seed_rank = 1` which was incorrectly assigned. This puts her above all other athletes except the World #1.

**Current State:**
| Position | Athlete | World Rank | seed_rank | Multiplier |
|----------|---------|------------|-----------|------------|
| 1 | Lang Erika | #1 | - | 3.2x |
| 2 | Natalia Cuglievan | None | 1 ❌ | 6x |
| 3 | Ross Neilly | #2 | - | 6.25x |
| ... | ... | ... | ... | ... |
| 7 | Rini Paige | #6 | - | 14x |

**Expected:**
| Position | Athlete | World Rank | Multiplier |
|----------|---------|------------|------------|
| 1 | Lang Erika | #1 | ~3x |
| 2 | Ross Neilly | #2 | ~4.5x |
| 3 | Hunter Anna | #3 | ~6x |
| 4 | Bonnemann Mechler | #4 | ~8x |
| 5 | Hansen Kennedy | #5 | ~10x |
| 6 | Rini Paige | #6 | ~12x |
| 7 | Natalia Cuglievan | Seeded #7 | ~13x |
| 8 | Verswyvel Daniela | #7 | ~14x |
| 9 | Straltsova Hanna | #8 | ~16x |

---

### Solution

#### Step 1: Update Natalia's Tournament Entry
Update her `seed_rank` from `1` to `7` so she's positioned after Paige Rini (#6).

**Database Update:**
```sql
UPDATE tournament_entries 
SET seed_rank = 7, discipline_rank = 7
WHERE id = 'd90ac8b1-a7db-4a34-b01b-ac99a9a3e2fc'
```

#### Step 2: Regenerate Market Odds
Trigger the odds regeneration for Women's Trick markets (WINNER, PODIUM, HIGHEST_SCORE).

---

### Technical Details

**Entry to Update:**
- Entry ID: `d90ac8b1-a7db-4a34-b01b-ac99a9a3e2fc`
- Athlete: Natalia Cuglievan
- Current seed_rank: 1 (wrong)
- New seed_rank: 7 (after Paige)

**Markets to Regenerate:**
- Tournament: BETA TESTING (d26feef0-7dee-4eba-aa8b-d36df42b30f7)
- Category: open_women
- Discipline: trick
- Market types: WINNER, PODIUM, HIGHEST_SCORE

---

### Expected Outcome

After the fix:
- Natalia Cuglievan will appear at position 7 with a ~13-14x multiplier
- Paige Rini stays at position 6 with a ~12x multiplier
- The market will correctly reflect competitive rankings

