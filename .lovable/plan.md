

## Tournament Recap Page -- Plan

### Overview
Create a new admin page at `/admin/tournament-recap/:id` that auto-generates a comprehensive post-settlement recap for any settled tournament. This pulls data from `bet_slips`, `predictions`, `profiles`, `athletes`, `fantasy_entries`, `fantasy_entry_athletes`, and `fantasy_pots` to display the same stats we've been calculating manually in chat.

### What Gets Built

**1. New page: `src/pages/admin/TournamentRecap.tsx`**

An admin-only page with a tournament selector (defaulting to most recently settled) that displays:

- **Header**: Tournament name, dates, settlement timestamp
- **Volume Stats Card**: Total entries, unique users, total wagered, total paid out, house P/L, win rate
- **Top Winners Table**: Top 5 users by net profit (username, athlete picked, stake, payout, net profit, odds)
- **Biggest Misses Card**: Largest potential payouts that lost (user, stake, odds, potential payout)
- **Trap Picks Card**: Most-backed athletes with 0 wins (athlete name, total staked, entry count)
- **Top Performing Athletes Card**: Athletes with highest win rates among backed entries
- **Discipline Breakdown**: Wagered/win-rate per discipline+category combo
- **Parlay Stats**: Total parlays placed, hit rate
- **Fantasy Results Card** (if fantasy pot exists for tournament): Winner, runner-up, points, MVP athletes, biggest bust
- **Copy-to-Clipboard Button**: Generates a formatted text recap (like the forum post) for easy social media sharing

**2. Route + Nav**
- Add route `/admin/tournament-recap/:id` and a fallback `/admin/tournament-recap` (shows selector)
- Add nav item in `AdminLayout.tsx`

**3. Data Fetching Approach**
All queries use the existing `supabase` client with admin RLS policies already in place:
- `bet_slips` joined with `profiles` and `athletes` for entry-level stats
- `fantasy_pots` + `fantasy_entries` + `fantasy_entry_athletes` for fantasy data
- `tournaments` filtered to `settled_at IS NOT NULL` for the selector
- Group-by aggregations done client-side with `useMemo` (dataset is small per tournament)

### Files Changed
| File | Change |
|------|--------|
| `src/pages/admin/TournamentRecap.tsx` | New file -- full recap page |
| `src/App.tsx` | Add import + route |
| `src/components/AdminLayout.tsx` | Add nav item |

### Technical Notes
- Follows existing admin page patterns (AdminLayout wrapper, useQuery, Card components)
- No database migrations needed -- all data already exists
- Copy-to-clipboard generates plain text formatted for forum/social posting
- Tournament selector dropdown filters to settled tournaments only

