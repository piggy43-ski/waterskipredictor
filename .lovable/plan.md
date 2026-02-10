

# Filter Out Already-Selected Athletes from Dropdown

## Problem
When adding scores, the athlete dropdown shows all athletes -- including ones already assigned to other rows. This makes it easy to accidentally pick the same athlete twice and slows down data entry.

## Solution
Update the `getFilteredAthletes` function to exclude athletes that are already selected in other rows for the same round/discipline/gender combination. The current row's athlete should still appear (so it shows the selected value correctly).

## Change (1 file)

### `src/pages/admin/TournamentSettlement.tsx`

Update `getFilteredAthletes` to accept the current row's `athlete_id` and filter out IDs already used in sibling rows:

```typescript
const getFilteredAthletes = (discipline: Discipline, gender: 'male' | 'female', currentAthleteId?: string) => {
  if (!tournamentData?.tournament?.tournament_entries) return [];

  const searchKey = `${selectedRound}-${discipline}-${gender}`;
  const searchTerm = athleteSearch[searchKey]?.toLowerCase() || '';

  // Collect athlete IDs already assigned in this round/discipline/gender
  const roundResults = results[selectedRound]?.[discipline]?.[gender] || [];
  const usedIds = new Set(
    roundResults
      .map(r => r.athlete_id)
      .filter(id => id && id !== currentAthleteId) // keep current row's athlete visible
  );

  return tournamentData.tournament.tournament_entries
    .filter((entry: any) =>
      entry.discipline === discipline &&
      entry.athlete?.gender === gender &&
      !usedIds.has(entry.athlete?.id) &&
      (!searchTerm || entry.athlete?.name?.toLowerCase().includes(searchTerm))
    )
    .map((entry: any) => entry.athlete)
    .filter(Boolean);
};
```

Then update the call site (around line 1431) to pass the current entry's athlete ID:

```typescript
const athletes = getFilteredAthletes(discipline, gender, entry.athlete_id);
```

This way, once Neilly Ross is assigned to a row, she won't appear in any other row's dropdown for the same round/discipline/gender.
