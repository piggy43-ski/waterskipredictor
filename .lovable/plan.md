

# Admin Dashboard: All User Transactions & Predictions

## Overview
Create two new admin pages that display all user transactions and predictions in a centralized, searchable, and filterable view. These pages will be accessible from the existing admin sidebar.

## What You'll Get

### 1. All Transactions Page
A comprehensive view of every token transaction across all users with:
- **Summary cards**: Total transactions, total inflow (deposits/bonuses/wins), total outflow (bets/burns), net flow
- **Searchable table** with columns: User, Type, Amount, Balance After, Description, Date
- **Filters**: Transaction type, date range, user search, amount range
- **Export option**: Download as CSV

### 2. All Predictions Page  
A comprehensive view of every prediction made by all users with:
- **Summary cards**: Total predictions, win rate, total wagered, total paid out
- **Searchable table** with columns: User, Tournament, Athlete, Contest Type, Stake, Multiplier, Status, Payout, Date
- **Filters**: Status (Pending/Won/Lost/Void), tournament, contest type, user search, date range
- **Click-through**: Click a user to see their full analytics drilldown

## Files to Create

### `src/pages/admin/AllTransactions.tsx`
New admin page containing:
- Summary stat cards at top
- Filter panel with collapsible controls
- Paginated table showing all token_transactions joined with profiles for user info
- CSV export button

### `src/pages/admin/AllPredictions.tsx`
New admin page containing:
- Summary stat cards at top  
- Filter panel with collapsible controls
- Paginated table showing all predictions joined with profiles for user info
- Click to drill down into specific user

## Files to Modify

### `src/components/AdminLayout.tsx`
Add two new navigation items to the sidebar:
```text
{ path: '/admin/all-transactions', label: 'All Transactions', icon: History }
{ path: '/admin/all-predictions', label: 'All Predictions', icon: Target }
```

### `src/App.tsx`
Add routes for the two new admin pages:
```text
/admin/all-transactions -> AllTransactions
/admin/all-predictions -> AllPredictions
```

---

## Technical Details

### Database Queries

**All Transactions Query:**
```sql
SELECT 
  t.id, t.user_id, t.type, t.amount, t.balance_after, 
  t.description, t.created_at,
  p.username, p.email
FROM token_transactions t
JOIN profiles p ON p.id = t.user_id
ORDER BY t.created_at DESC
LIMIT 500
```

**All Predictions Query:**
```sql
SELECT 
  pred.id, pred.user_id, pred.tournament_name, pred.athlete_name,
  pred.market_type, pred.discipline, pred.category,
  pred.staked_tokens, pred.decimal_odds, pred.status, 
  pred.payout_tokens, pred.created_at,
  p.username, p.email
FROM predictions pred
JOIN profiles p ON p.id = pred.user_id
ORDER BY pred.created_at DESC
LIMIT 500
```

### Filtering Implementation
- Client-side filtering for responsive UX
- Type-ahead search for user lookup
- Date range picker using existing Calendar component
- Status/type dropdowns using Select component

### Reusable Patterns
- Follow existing patterns from `src/pages/admin/HouseLedger.tsx` for stat cards
- Follow patterns from `src/pages/Transactions.tsx` for filter panel design
- Use existing `UserAnalyticsDrilldown` component for drill-down functionality

### UI Components Used
- Card, Table, Badge, Button from shadcn/ui (already installed)
- Calendar, Popover for date filtering
- Select for dropdown filters
- Input for search/amount filters

