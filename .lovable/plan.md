## Scope

Apply the locked design system (true black, electric cyan, Bebas Neue, hairline borders, Apple easing) to `/tournaments/:id` (the real route — `/events/:eventId` doesn't exist; it's `TournamentDetailClean.tsx`).

**Visual + layout only. No data fetching, no engine logic, no new tables.**

## In scope (data already exists)

1. **Typographic hero (no image)**
   - True black, no card.
   - Top-left status pill (UPCOMING / LIVE / FINAL) in cyan.
   - Bebas Neue event name, uppercase, fills width, 2-line wrap.
   - Location + dates underneath in small-caps muted gray.
   - 3-column stat row (hairline vertical dividers): **Entrants / Disciplines / Closes In** — Bebas Neue numerics, countdown in tabular monospace cyan.
   - (Prize Pool is not in our schema — swapped for **Disciplines** count, which we already render.)
   - Hairline border underneath.

2. **Discipline / gender / market-type tabs**
   - Restyled as underline tabs (2px cyan underline on active, no pill background).
   - Sticky under hero when scrolled.

3. **Skier rows (the money screen)**
   - Replace `SelectionCard` visuals with a dense row:
     - Rank badge `#1` on the left.
     - 40px circular athlete photo (placeholder initials if no photo — current schema doesn't store photos; uses initials).
     - Name + country flag emoji + world rank.
     - Bebas Neue multiplier right-aligned in cyan.
   - Top 3 favorites: 2px cyan left-border accent.
   - Press-scale 0.98 with Apple easing on tap.
   - Shimmer skeletons on initial load.

4. **Selected-state polish**
   - When user opens prediction dialog, the row's multiplier briefly pulses cyan (subtle, 1 cycle).

5. **Sticky parlay/prediction CTA**
   - Existing Parlay Builder button restyled into a sticky bottom bar (above bottom nav) with cyan accent.

## Out of scope (need new data work — flag for separate prompt)

The following items in your brief require new queries / endpoints I'd have to build:

- **Sticky prediction-slip drawer with live "Projected Reward"** — current flow uses single-selection dialog (`PredictionDialog`) per row tap. A multi-select slip drawer is a UX/flow change, not visual polish. Existing `ParlayBuilder` modal already does this; converting it to a persistent drawer is a feature.
- **Field Analysis tab (rating, recent finishes, win-prob bar)** — we have `rating_0_100` and `discipline_rank` per entry, so a bar viz is doable. But "recent finishes per athlete" requires querying `athlete_results` across past tournaments — new fetch.
- **Recent Form chips (last 5 events per athlete)** — same: needs new historical query.
- **Head-to-Head matrix** — no existing data or query.
- **Live Leaderboard preview (top 5 predictors for this event)** — needs new aggregation query over `bet_slips` / `predictions`.
- **Share button / result-card generator** — needs canvas/og-image renderer.

If you want any of those, I'll do them as a separate prompt with the data work.

## Files

- `src/pages/TournamentDetailClean.tsx` — hero, status pill, stat strip, tabs restyle, sticky CTA.
- `src/components/SelectionCard.tsx` — densified row layout, rank badge, cyan multiplier, top-3 accent, press-scale.
- `src/components/ui/skeleton.tsx` is already shimmer-ready.

## Confirm

Reply "go" to proceed with the in-scope items above. If you want the out-of-scope features now, tell me which and I'll plumb the data first.