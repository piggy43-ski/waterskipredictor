
# Add Skiers to Swiss Pro Slalom (T-26USA011)

Tournament: **Swiss Pro Slalom** (`76329f1b-a36d-4232-b1f8-5ced4484fd4d`)
Date: May 3, 2026 | Discipline: slalom | Format: 2 rounds + finals

## Athletes from Start Lists

**Open Women (11 skiers):**
1. Bagnoli Alice (ITA) -- exists
2. Kretschmer Daniela (CHI) -- exists
3. Espinal Trinidad (CHI) -- exists
4. De Osma Bedoya Cristhiana (PER) -- exists as "De Osma Cristhiana" (will use existing record)
5. Montavon Elizabeth (USA) -- exists
6. Vieke Vennesa (AUS) -- exists
7. Garcia Alexandra (USA) -- exists
8. Ross Neilly (CAN) -- exists
9. Jaquess Regina (USA) -- exists
10. Nicholson Allie (USA) -- exists
11. Bull Jaimee (CAN) -- exists

**Open Men (19 skiers):**
1. Stadlbaur Benjamin (SUI) -- NEEDS CREATING (Vincent exists, Benjamin is different)
2. Belmrah Kamil (MAR) -- exists
3. Attensam Nikolaus (AUT) -- exists
4. Neveu Stephen (CAN) -- exists
5. Calhoun Jamie (CAN) -- exists
6. Poland Joel (GBR) -- exists
7. Dailland Thibaut (FRA) -- exists
8. Tornquist Tim (SWE) -- NEEDS CREATING
9. Mccormick Cole (CAN) -- exists
10. Palomino Blanch Jaime (MEX) -- NEEDS CREATING
11. Travers Jonathan (USA) -- exists
12. Asher William (GBR) -- exists
13. Mechler Dane (USA) -- exists
14. Hazelwood Robert (GBR) -- exists
15. Ross Charlie (CAN) -- exists
16. Sedlmajer Adam (CZE) -- exists
17. Degasperi Thomas (ITA) -- exists
18. Smith Nate (USA) -- exists
19. Winter Frederick (GBR) -- exists

## Steps

### 1. Create 3 missing athletes
Insert into `athletes` table:
- **Stadlbaur Benjamin** (SUI, male, slalom)
- **Tornquist Tim** (SWE, male, slalom)
- **Palomino Blanch Jaime** (MEX, male, slalom)

Each will get default slalom ratings (~70). Add `slalom` to their disciplines array.

### 2. Add slalom to disciplines for existing athletes
Some existing athletes (from the tricks tournament) may not have `slalom` in their disciplines array. Will check and update where needed.

### 3. Insert tournament entries
30 rows into `tournament_entries` (11 women + 19 men), all with `discipline = 'slalom'`, linking to the tournament ID.

### 4. Generate markets and odds
Call `auto-generate-markets` for the tournament, which will:
- Create 6 markets (WINNER / PODIUM / HIGHEST_SCORE x open_men / open_women)
- Run Monte Carlo odds generation
- Multipliers will stay reasonable with 11 women and 19 men (large enough fields for healthy distributions)

### 5. Review and publish markets
After generation, verify multipliers are sensible (no crazy 50x+ on anyone). Publish the markets so they're visible to users.

## Notes
- "De Osma Bedoya Cristhiana" on IWWF matches existing "De Osma Cristhiana" -- same person, will use existing ID (`8cca512c-2734-4b25-8f35-e6860d184436`)
- Tournament format is 2 rounds + finals (qualifying, semifinal, final) -- same as Swiss Pro Tricks
- The user wants "predictions" terminology, not "betting slips" -- no code changes needed, this is just a reminder for any UI text
