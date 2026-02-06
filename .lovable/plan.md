

## Token Purchase History - Admin Dashboard Enhancement

### The Problem
The House Ledger currently shows only a summary stat "Tokens Purchased" but **doesn't display a detailed table** showing:
- Who bought tokens (user email/username)
- When they bought (timestamp)
- How much they spent (USD amount)
- How many tokens they received
- Which pack they purchased (Starter, Standard, Pro, Elite)

The data exists in your `deposit_ledger` table (3 purchases totaling $195), but the UI doesn't show this detail.

### The Solution
Add a **Token Purchases section** to the House Ledger page with a detailed table showing all token purchase transactions.

### What You'll See

**New "Token Purchases" Card** with columns:
| User | Pack | Date | Amount (USD) | Tokens Received | Stripe ID |
|------|------|------|--------------|-----------------|-----------|
| john@email.com | Standard | Feb 5, 2026 | $55.00 | 5,500 | pi_3Sxa... |
| jane@email.com | Pro | Feb 4, 2026 | $115.00 | 11,500 | pi_3SxA... |
| mike@email.com | Starter | Feb 3, 2026 | $25.00 | 2,500 | pi_3Swp... |

**Summary Stats at Top:**
- Total Revenue: $195.00
- Total Tokens Sold: 19,500
- Unique Buyers: 3

---

### Technical Details

**Data Source:** `deposit_ledger` table joined with `profiles` table

**Query Pattern:**
```sql
SELECT 
  dl.*,
  p.username,
  p.email
FROM deposit_ledger dl
LEFT JOIN profiles p ON dl.user_id = p.id
WHERE dl.transaction_type = 'deposit'
ORDER BY dl.created_at DESC
```

**UI Components:**
1. Add new query `useQuery` for fetching deposit ledger with user info
2. Add summary cards for total revenue, tokens sold, unique buyers
3. Add sortable/filterable table with all purchase details
4. Include click-to-copy for Stripe payment intent IDs

**File Changes:**
- `src/pages/admin/HouseLedger.tsx` - Add Token Purchases section after Token Flow card

