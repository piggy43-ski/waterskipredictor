

## Investigation Results

The 100-token minimum **is being enforced correctly**. Here is what happened:

Domino placed two **parlays** of 100 tokens each. Each parlay has 5 legs, and the system divides the stake evenly across legs: 100 / 5 = **20 tokens per prediction row**. The Live Activity Feed reads from the `predictions` table (individual legs), so it displays "20 tokens" per entry — but the actual bet slip is 100 tokens total.

This is **not a bug in the minimum stake enforcement**. It is a **display issue** in the Activity Feed.

## Plan: Fix Activity Feed to Show Bet Slip Totals for Parlays

### Changes

1. **Update `RealtimeActivityFeed.tsx`** to join predictions with `bet_slips` and display the bet slip's `total_stake_tokens` instead of the individual prediction's `staked_tokens`. For parlays, show the total stake with a "Parlay (5 legs)" badge. For singles, show the stake as-is.

   - Modify the initial fetch query to join `bet_slips` via `bet_slip_id` and pull `total_stake_tokens` and `type` from the slip
   - In the display, show `total_stake_tokens` from the bet slip and add a "Parlay" indicator when `type === 'parlay'`
   - Group parlay legs under a single feed entry (or show them individually but with the parlay context and total stake)

2. **Also fix `rebuild_market_liability`** — change `'pending'` to `'PENDING'` (case mismatch identified earlier).

### Technical Detail

The `predictions` table stores per-leg data (`staked_tokens = total / leg_count`), while `bet_slips` stores the actual total. The feed should reference `bet_slips.total_stake_tokens` for accurate display. Two approaches:

- **Option A**: Group by bet_slip_id, show one feed entry per parlay with total stake and leg count
- **Option B**: Keep individual leg entries but show "100 tokens (parlay)" instead of "20 tokens"

Option B is simpler and preserves the granular athlete-level detail that makes the feed useful.

