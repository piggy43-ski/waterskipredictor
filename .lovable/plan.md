
# Yearly Fantasy League with Buy/Sell Transfers

## Overview
Create a season-long fantasy league system where users:
1. Pick an initial team at the start of the season
2. Can buy/sell athletes between tournaments (transfer windows)
3. Accumulate points across all tournaments throughout the year
4. Compete for season-long prizes

---

## Current State vs New Features

| Feature | Current State | New Behavior |
|---------|--------------|--------------|
| Season pot type | Database supports it | Full user-facing experience |
| Team editing | Only before first tournament | Transfer windows between each tournament |
| Pricing | Static at selection | Dynamic - prices change after each event |
| Budget tracking | Fixed budget at start | Tracks remaining budget with buy/sell |
| Roster lock | All or nothing | Per-tournament snapshots |
| Transfer history | None | Full audit trail |

---

## Database Changes

### 1. New Table: `fantasy_transfers`
Track every buy/sell transaction for audit and history.

```text
fantasy_transfers
  - id (uuid, PK)
  - entry_id (uuid, FK -> fantasy_entries)
  - athlete_id (uuid, FK -> athletes)
  - discipline (text)
  - transfer_type (text: 'buy' | 'sell')
  - price (integer)  -- price at time of transfer
  - transfer_window (uuid, FK -> tournaments)  -- which window this occurred in
  - created_at (timestamp)
```

### 2. New Table: `fantasy_roster_snapshots`
Freeze roster state when each tournament starts for scoring.

```text
fantasy_roster_snapshots
  - id (uuid, PK)
  - entry_id (uuid, FK -> fantasy_entries)
  - tournament_id (uuid, FK -> tournaments)
  - snapshot (jsonb)  -- { athletes: [{id, discipline, price}...] }
  - created_at (timestamp)
```

### 3. Modify `fantasy_entries` Table
Add budget tracking for season leagues.

```text
Add columns:
  - remaining_budget (integer, default 100000)
  - transfers_made (integer, default 0)
```

### 4. Modify `fantasy_pots` Table
Add season configuration options.

```text
Add columns:
  - transfer_fee_percent (numeric, default 0)  -- optional fee on sells
  - max_transfers_per_window (integer, nullable)  -- limit swaps
```

---

## Transfer Window Logic

```text
Tournament Timeline:
  ┌─────────────────────────────────────────────────────────────┐
  │ Season Start                                                │
  │ ↓                                                           │
  │ [Initial Team Selection - Open]                             │
  │ ↓                                                           │
  │ Tournament 1 Starts → Roster LOCKED for T1                  │
  │ ↓                                                           │
  │ Tournament 1 Ends → Transfer Window Opens                   │
  │ ↓                                                           │
  │ [Buy/Sell Period] - Can swap athletes                       │
  │ ↓                                                           │
  │ Tournament 2 Starts → Roster LOCKED for T2                  │
  │ ↓                                                           │
  │ ... repeat ...                                              │
  │ ↓                                                           │
  │ Final Tournament Ends → Season Settled                      │
  └─────────────────────────────────────────────────────────────┘
```

**Lock Rule Update:**
- Season pots are NOT fully locked when a tournament is live
- Instead, roster is "snapshot locked" for that specific tournament
- Users can still plan transfers that take effect after the tournament ends

---

## Buy/Sell Mechanics

### Selling an Athlete
1. User selects athlete to sell from roster
2. System shows current market price (from `athletes.fantasy_price_{discipline}`)
3. Optional: Apply transfer fee (e.g., 10% of sale price goes to "house")
4. Credit remaining_budget with sale proceeds
5. Remove from roster, add to transfer history

### Buying an Athlete
1. User browses available athletes
2. System shows current market price
3. Check: Has budget? Is roster slot available?
4. Deduct from remaining_budget
5. Add to roster, add to transfer history

### Price Changes
After each tournament, the existing pricing engine already adjusts prices:
- Winners increase ~5%
- Poor performers decrease ~2-5%
- Creates market dynamics where "buying low" on underperformers can pay off

---

## User Interface Changes

### 1. Season League Page (`FantasySeasonView.tsx`)
New page showing:
- Season standings (cumulative points)
- Upcoming tournaments
- Transfer window status
- Quick link to edit team (when window open)

### 2. Transfer Window UI (`FantasyTransferWindow.tsx`)
When transfer window is open:
- Show current roster with SELL buttons
- Show "market" of available athletes with BUY buttons
- Display remaining budget prominently
- Show price change indicators (↑↓) since last window
- Transaction confirmation dialog

### 3. Update Fantasy Hub (`Fantasy.tsx`)
- Add "Season Leagues" section separate from Tournament leagues
- Show season progress bar
- Highlight active transfer windows

### 4. Update Team View (`FantasyTeamView.tsx`)
For season entries:
- Show cumulative points across tournaments
- Show per-tournament breakdown
- Show transfer history tab

---

## Backend Logic

### 1. Update Lock Rules (`fantasyLockRules.ts`)
```text
For season pots:
  - isLocked = false (allow ongoing access)
  - canEditRoster = calculated based on transfer window status
  - getActiveTransferWindow() returns current window or null
```

### 2. Transfer Window Detection
```text
function getTransferWindowStatus(pot, tournaments):
  if no tournaments: return { status: 'initial', canTransfer: true }
  
  liveTournament = find tournament where status = 'live'
  if liveTournament: return { status: 'locked', canTransfer: false, tournament: liveTournament }
  
  lastFinished = most recent tournament where status = 'finished'
  nextUpcoming = next tournament where status = 'upcoming'
  
  if lastFinished && nextUpcoming:
    return { status: 'transfer_window', canTransfer: true, 
             window: lastFinished, deadline: nextUpcoming.start_datetime }
  
  return { status: 'season_ended', canTransfer: false }
```

### 3. Roster Snapshot Trigger
Before each tournament starts, snapshot all season entries' rosters:
- Edge function triggered by cron or manually before tournament
- Copies current roster to `fantasy_roster_snapshots`
- Scoring uses snapshot, not live roster

### 4. Update Scoring Function
Modify `score-fantasy` edge function:
- For season pots, use roster snapshot for that tournament
- Add points to season total (not replace)

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/pages/FantasySeasonView.tsx` | Season league dashboard |
| `src/components/fantasy/TransferWindow.tsx` | Buy/sell interface |
| `src/components/fantasy/TransferHistory.tsx` | Transaction log |
| `src/utils/transferWindowRules.ts` | Transfer window logic |
| `supabase/functions/snapshot-season-rosters/index.ts` | Pre-tournament snapshot |

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Fantasy.tsx` | Add season leagues section |
| `src/pages/FantasyTeamView.tsx` | Season-specific views |
| `src/utils/fantasyLockRules.ts` | Transfer window logic |
| `supabase/functions/score-fantasy/index.ts` | Use snapshots for season |
| `src/pages/admin/FantasyPots.tsx` | Season pot configuration |

---

## Phase 1 Implementation (Core)

1. Database migrations for new tables
2. Transfer window detection logic
3. Basic buy/sell UI
4. Roster snapshots before tournaments
5. Season scoring updates

## Phase 2 Enhancements (Later)

- Transfer fee configuration
- Max transfers per window limits
- Price change notifications
- "Watchlist" feature for athletes
- Transfer deadline countdown
- Season leaderboard with tiebreakers
