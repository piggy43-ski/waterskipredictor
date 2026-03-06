

## Add Martin Labra to Database and Moomba Tournament

### Step 1: Insert Athlete Record
Insert Martin Labra into the `athletes` table with:
- **Name**: Martin Labra
- **Gender**: male
- **Country**: Chile (CHI)
- **Federation**: IWWF
- **Disciplines**: `{slalom, trick, jump}`
- **Year of birth**: TBD (will use a reasonable default like 2000)
- **Ratings**: slalom=70, trick=92, jump=86
- **Injury flag**: false (recovered, competed last tournament)
- **Career stats**: Set trick-specific stats reflecting his elite level (base_strength_trick=92, base_strength_slalom=70, base_strength_jump=86)
- **Fantasy prices**: Calculated from ratings (trick=10000, slalom=5500, jump=8500)
- **Strength tiers**: trick=tier2, slalom=unranked, jump=tier2
- **Notes**: "Elite tricker, missed most of last season due to injury. Scored 12,750 pts in last tournament."

### Step 2: Add Tournament Entries
Insert 3 rows into `tournament_entries` for Moomba Masters (`6b2ee218-5957-41ec-be67-1d1d5af281ae`) — one for each discipline (slalom, trick, jump) using the new athlete's ID.

### Step 3: No Code Changes Needed
The Fantasy team builder already pulls athletes from `tournament_entries`, so Martin Labra will appear automatically once the data is inserted.

