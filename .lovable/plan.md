

## Add Swiss Pro Tricks Athletes

### Summary
Create 3 missing athletes in the database and ensure all 21 participants are linked to the Swiss Pro Tricks tournament markets. No code changes needed -- this is purely database work.

### Step 1: Create 3 new athletes via database migration

Insert these athletes into the `athletes` table:

| Name | Gender | Country | Disciplines |
|------|--------|---------|-------------|
| Gay Ella | female | USA | trick |
| Krueger Ridge | male | USA | trick |
| Elias Adrian | male | SVK | trick |

Note: Names follow the existing "LastName FirstName" convention used in the database (matching IWWF format).

### Step 2: Add market entries for the Swiss Pro Tricks tournament

Query the existing markets for tournament `7bf0f645-54f5-497a-9b95-208c01fb9609` and create `market_entries` linking all 21 athletes to the appropriate trick markets (open_men and open_women categories).

If markets don't exist yet for this tournament, they'll need to be created first (trick/open_men and trick/open_women).

### Files Changed
No source code changes. All work is database inserts via migration + insert tools.

### What won't change
- No UI changes
- No edge function changes
- Existing athletes' data untouched

