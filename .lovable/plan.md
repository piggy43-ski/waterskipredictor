

## Auto-select discipline + center single tab

### Problem
1. The default discipline tab is `slalom` (line 50), so when this tournament only has `trick`, nothing shows until user clicks the Trick tab.
2. The discipline `TabsList` always renders a 3-column grid (`grid-cols-3`), so a single tab appears left-aligned instead of centered.

### Plan

**File: `src/pages/TournamentDetailClean.tsx`**

1. **Fix default discipline** (line 50): Change the initial discipline logic to auto-select the first available discipline from the tournament data instead of defaulting to `slalom`. Since tournament data loads async, we'll also add a `useEffect` to update the active tab once disciplines are known.

2. **Dynamic grid columns** (line 1030): Change `grid-cols-3` to be dynamic based on the number of disciplines:
   - 1 discipline → `grid-cols-1` with `max-w-[200px] mx-auto` to center
   - 2 disciplines → `grid-cols-2`
   - 3 disciplines → `grid-cols-3`

### Technical detail

```tsx
// Line 50: smarter default
const initialDiscipline = searchParams.get('discipline') || '';

// Add useEffect after tournament loads to set first discipline as default
// Use a state variable for the active tab so we can update it
const [activeDiscipline, setActiveDiscipline] = useState(initialDiscipline);

useEffect(() => {
  if (!activeDiscipline && tournament?.disciplines?.length) {
    setActiveDiscipline(tournament.disciplines[0]);
  }
}, [tournament]);

// Line 1029: controlled Tabs
<Tabs value={activeDiscipline} onValueChange={setActiveDiscipline}>

// Line 1030: dynamic grid
const discCount = tournament.disciplines.length;
<TabsList className={cn(
  "w-full mb-6",
  discCount === 1 ? "flex justify-center" : `grid grid-cols-${discCount}`
)}>
```

