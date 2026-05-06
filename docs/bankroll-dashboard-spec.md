# Bankroll & Exposure Dashboard — Spec v1

Route: `/admin/bankroll` (new). Wrapped in `AdminLayout` + `useAdminCheck`.
Add nav entry in `src/components/AdminLayout.tsx` ("Bankroll", icon `Wallet`).

## Goal
Operational visibility on house position before / during / after events.
Read-only. No mutations. No new tables.

## Data sources (existing)
- `token_wallets` — earned + purchased balances per user
- `bet_slips` — stake, potential_payout, status, tournament_id, market_id
- `token_transactions` — realized P/L (prediction_won, prediction_lost, etc.)
- `deposit_ledger` — Stripe cash collected (USD truth)
- `tournaments`, `markets`, `profiles` — joins for labels
- `house_bankroll_summary` view — **not used for v1**; its `total_handle/liability` derive from config bankroll, not the live wallet/slip view we want here. Query directly.

Conversion: 1 token = $0.01 (`tokensToUSD` from `src/utils/tokenConversion.ts`).

## Headline metrics (4 large cards, color-coded)

| Metric | Source | Color rule |
|---|---|---|
| **Cash collected** | `SUM(amount_usd) FROM deposit_ledger WHERE transaction_type='deposit'` (fallback: `SUM(purchased_tokens) FROM token_wallets` × $0.01) | neutral |
| **Total wallet liability** | `SUM(earned_tokens + purchased_tokens) FROM token_wallets` | neutral |
| **Open exposure** | `SUM(potential_payout_tokens) FROM bet_slips WHERE status='PENDING'` | yellow if >50% of cash, red if >100% |
| **Net house position** | `cash − (realized_payouts + open_exposure)` where realized = `SUM(amount) FROM token_transactions WHERE type IN ('prediction_won','bet_won','fantasy_payout') × $0.01` | green ≥0, yellow −$500..0, red <−$500 |

## Threshold banner (top, single component, stacks multiple triggers)
Renders above metrics. Yellow = warning, red = critical.
- Net position < −$1,000 → red
- Open exposure > 50% of cash collected → yellow (>100% red)
- Any user's `earned_tokens` > 10% of total earned → yellow
- Any single PENDING slip's `potential_payout_tokens` > 5,000 ($50) → yellow

Each trigger renders one line in plain language with the actual numbers, e.g. *"Open exposure $1,200 — 73% of cash collected $1,640. Tighten caps or close hot markets."*

## Per-event breakdown table
Tournaments with ≥1 `bet_slip` in last 90 days.

```sql
SELECT t.id, t.name, t.status, t.settled_at,
  COUNT(bs.id) AS entries,
  SUM(bs.total_stake_tokens) AS stake_tokens,
  SUM(CASE WHEN bs.status='PENDING' THEN bs.potential_payout_tokens ELSE 0 END) AS open_payout_tokens,
  SUM(COALESCE(bs.actual_payout_tokens,0)) AS actual_payout_tokens
FROM tournaments t
JOIN bet_slips bs ON bs.tournament_id = t.id
WHERE bs.created_at > now() - interval '90 days'
  AND bs.status <> 'CANCELLED'
GROUP BY t.id ORDER BY t.start_datetime DESC NULLS LAST;
```
House P/L per settled event = `stake − actual_payout`. For open events show `(open: −$X exposure)`.

## Top 10 user concentration
```sql
SELECT user_id, earned_tokens
FROM token_wallets
WHERE earned_tokens > 0
ORDER BY earned_tokens DESC LIMIT 10;
```
Display: `uuid.slice(0,8)`, balance (tokens + USD), `% of total earned`. Total earned computed in same query (window) or a second tiny aggregate query.

## Open exposure by market
```sql
SELECT m.id, m.name, m.market_type, t.name AS tournament,
  COUNT(bs.id) AS open_tickets,
  SUM(bs.potential_payout_tokens) AS open_payout_tokens
FROM bet_slips bs
JOIN markets m ON m.id = bs.market_id
JOIN tournaments t ON t.id = bs.tournament_id
WHERE bs.status = 'PENDING' AND bs.market_id IS NOT NULL
GROUP BY m.id, m.name, m.market_type, t.name
ORDER BY open_payout_tokens DESC;
```
Parlay slips have null `market_id` — bucket those into a single "Parlays" row via separate query on `bs.market_id IS NULL AND bs.type='parlay'`.

## Real-time refresh
`useQuery` from `@tanstack/react-query` (already in deps) with `refetchInterval: 30_000` and `refetchOnWindowFocus: true`. Display `lastUpdatedAt = dataUpdatedAt` from query result, formatted as "Updated 12s ago" using a 1s ticking `setInterval`.

## Charts
`recharts` is in deps (`^2.15.4`). Minimal use for v1:
- Optional small bar chart for "Open exposure by market" (top 8).
- Headline numbers as plain styled cards. Keeps the page scannable.

## Component breakdown
```
src/pages/admin/BankrollDashboard.tsx        // page + react-query orchestration
src/components/admin/bankroll/
  ├── ThresholdBanner.tsx                    // takes triggers[], renders alerts
  ├── HeadlineMetrics.tsx                    // 4 colored stat cards
  ├── EventBreakdownTable.tsx
  ├── UserConcentrationTable.tsx
  └── MarketExposureTable.tsx
```
Add route to `src/App.tsx` (existing Protected + admin gate pattern). Add nav item to `AdminLayout.tsx`.

## Queries — count
5 supabase calls, all read-only, parallelized via `Promise.all` inside one `useQuery`:
1. cash collected — `deposit_ledger` aggregate
2. wallet totals — `token_wallets` aggregate
3. realized payouts — `token_transactions` aggregate by type
4. open slips full row set — feeds open-exposure total, per-market, per-event-open, max-single-slip trigger
5. closed slips last 90d (per-event settled P/L) + top 10 wallets + grand-total earned

## Complexity estimate
- 1 page + 5 small components, ~400 LOC total
- No migrations, no edge functions, no new types
- All queries are aggregates on small tables (token_wallets ~150, bet_slips ~600). No perf concern at current scale.
- Effort: **Small-Medium**, ~1 implementation pass + manual smoke check at `/admin/bankroll`.

## Out of scope (v1)
- Historical timeseries (would need snapshots table)
- Per-user drilldown (already exists in `UserAnalyticsDrilldown`)
- Push / email alerts — banner only
- Fantasy pot liability — separate concern

## Open questions for review
1. **Cash-collected source**: prefer `deposit_ledger` (true USD) or `purchased_tokens` proxy? Spec uses `deposit_ledger` with proxy fallback if it returns 0/null.
2. **Single-slip banner threshold**: 5,000 tokens ($50) — current observed max is 1,000 ($10). Confirm.
3. **CANCELLED slips**: spec excludes everywhere (treated as never-existed).
4. **Fantasy pots**: not included in liability/exposure for v1. Confirm.
