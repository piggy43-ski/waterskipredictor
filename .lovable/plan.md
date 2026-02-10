

# Fix: Prevent Loss of Score Data on Page Refresh

## Problem
When entering scores on the Tournament Settlement page, the page sometimes refreshes (due to code deployments or browser events), wiping all unsaved work. Scores are stored only in React state, so any full page reload loses everything.

## Solution
**Auto-save in-progress results to browser sessionStorage** so they persist across page refreshes. This is lightweight and doesn't require database changes.

## Implementation

### File: `src/pages/admin/TournamentSettlement.tsx`

**1. Add a debounced auto-save to sessionStorage whenever results change**

Every time the `results` state updates, save it to `sessionStorage` under a key that includes the tournament ID. This happens automatically in the background.

```typescript
// Save results to sessionStorage whenever they change
useEffect(() => {
  if (selectedTournament && hasLoadedInitialData) {
    const key = `settlement-draft-${selectedTournament}`;
    sessionStorage.setItem(key, JSON.stringify(results));
  }
}, [results, selectedTournament, hasLoadedInitialData]);
```

**2. Restore from sessionStorage on load (before database data)**

When a tournament is selected, check sessionStorage first. If a draft exists and is newer than what's in the database, use it instead.

```typescript
// In the existing "load initial data" useEffect, add sessionStorage check:
useEffect(() => {
  if (!selectedTournament || hasLoadedInitialData) return;

  const key = `settlement-draft-${selectedTournament}`;
  const savedDraft = sessionStorage.getItem(key);

  if (savedDraft) {
    try {
      const parsed = JSON.parse(savedDraft);
      setResults(parsed);
      setHasLoadedInitialData(true);
      toast({ title: 'Restored unsaved draft', description: 'Your previous entries were recovered.' });
      return; // Skip loading from DB
    } catch {}
  }

  // Fall through to existing DB load logic...
}, [tournamentData?.existingResults, hasLoadedInitialData, selectedTournament]);
```

**3. Clear the draft after successful save**

When results are saved to the database successfully, remove the sessionStorage draft.

```typescript
// In the save mutation onSuccess:
sessionStorage.removeItem(`settlement-draft-${selectedTournament}`);
```

**4. Also persist selectedTournament, selectedRound, and selectedDiscipline**

So the user returns to exactly where they left off:

```typescript
useEffect(() => {
  if (selectedTournament) {
    sessionStorage.setItem('settlement-selected-tournament', selectedTournament);
    sessionStorage.setItem('settlement-selected-round', selectedRound);
    sessionStorage.setItem('settlement-selected-discipline', selectedDiscipline);
  }
}, [selectedTournament, selectedRound, selectedDiscipline]);

// On mount, restore selections:
const [selectedTournament, setSelectedTournament] = useState(
  () => sessionStorage.getItem('settlement-selected-tournament') || ''
);
const [selectedRound, setSelectedRound] = useState<RoundType>(
  () => (sessionStorage.getItem('settlement-selected-round') as RoundType) || 'final'
);
const [selectedDiscipline, setSelectedDiscipline] = useState<Discipline>(
  () => (sessionStorage.getItem('settlement-selected-discipline') as Discipline) || 'slalom'
);
```

## What This Achieves
- Scores survive page refreshes, code deployments, and accidental navigation
- A toast notification confirms when a draft is restored
- Drafts are automatically cleared after a successful save
- The selected tournament, round, and discipline tabs are also preserved
- No database changes needed

