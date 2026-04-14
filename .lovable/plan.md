

## Update Men's Trick Multipliers + Add Champion/Injury Indicators

### 1. Database: Add `defending_champion_discipline` column to athletes table
Add a text array column `defending_champion_disciplines` (e.g. `['trick']`) to the `athletes` table so we can show a trophy badge per discipline. This is better than a boolean because an athlete could be defending champion in one discipline but not another.

**Migration SQL:**
```sql
ALTER TABLE athletes ADD COLUMN defending_champion_disciplines text[] DEFAULT '{}';
```

### 2. Data Updates (via insert/update tool)
- **Martin Labra**: Set `injury_flag = true`
- **Matías González**: Set `defending_champion_disciplines = ['trick']`
- **Erika Lang**: Set `defending_champion_disciplines = ['trick']`
- **Men's Trick market multipliers** (update `market_odds` + `selections`):
  - Dorien Lelong → 15.0x
  - Font Pablo → 18.0x
  - Martin Labra → 20.0x
  - Elias Adrian → 20.0x
  - Kruger Ridge → 20.0x

### 3. UI: Add trophy badge to SelectionCard and PodiumSelectionCard
Show a 🏆 **Defending Champion** badge next to the athlete name when `defending_champion_disciplines` includes the current discipline.

**Files changed:**
| File | Change |
|------|--------|
| `src/components/SelectionCard.tsx` | Add 🏆 badge when athlete is defending champion for the discipline |
| `src/components/PodiumSelectionCard.tsx` | Same trophy badge |
| `src/types/index.ts` | Add `defending_champion_disciplines` to the `Athlete` type |

### 4. Verify
Check the tournament detail page to confirm multipliers, injury badge on Martin Labra, and trophy badges on Matías González and Erika Lang.

