

# Fix: bet_slips Status Out of Sync with Predictions

## Problem

The "My Predictions" page reads from `bet_slips.status` to determine what's Active vs History. All 90 bet slips for the BETA TESTING tournament are still `PENDING`, even though their child `predictions` rows are already settled (WON, LOST, or VOID). This is why the screenshot shows "Pending" cards.

**Root cause**: The settlement process (and the earlier manual void migration) updated `predictions.status` but never updated the parent `bet_slips.status` or `bet_slips.settled_at`.

## Fix (two parts)

### Part 1: Immediate data fix (SQL migration)

Run a one-time SQL to sync all BETA TESTING bet_slips with their predictions:

- For each bet_slip, derive the correct status from its predictions:
  - If ALL predictions are VOID -> bet_slip status = 'VOID'
  - If ANY prediction is WON -> bet_slip status = 'WON'  
  - If all predictions are LOST (none WON, none VOID) -> bet_slip status = 'LOST'
  - Mixed WON+LOST (parlay partial) -> bet_slip status = 'LOST' (parlay requires all legs)
- Set `settled_at = now()` on all affected bet_slips
- Also compute `actual_payout_tokens` from the predictions' payout data

### Part 2: Prevent future desync

Update `supabase/functions/settle-predictions/index.ts` to always update the parent `bet_slips` row after settling its child predictions. After processing all predictions for a selection:

- Query all bet_slip_ids that had predictions settled in this batch
- For each bet_slip, re-derive status from its predictions (same logic as above)
- Update `bet_slips.status`, `bet_slips.settled_at`, and `bet_slips.actual_payout_tokens`

## Technical Details

### SQL for Part 1

```sql
-- Sync bet_slips status from settled predictions
WITH slip_statuses AS (
  SELECT 
    bs.id,
    CASE
      WHEN COUNT(*) FILTER (WHERE p.status NOT IN ('VOID')) = 0 THEN 'VOID'
      WHEN COUNT(*) FILTER (WHERE p.status = 'PENDING') > 0 THEN 'PENDING'
      WHEN bs.type = 'parlay' AND COUNT(*) FILTER (WHERE p.status = 'LOST') > 0 THEN 'LOST'
      WHEN COUNT(*) FILTER (WHERE p.status = 'WON') > 0 THEN 'WON'
      ELSE 'LOST'
    END as derived_status,
    COALESCE(SUM(p.payout_tokens) FILTER (WHERE p.status = 'WON'), 0) as total_payout
  FROM bet_slips bs
  JOIN predictions p ON p.bet_slip_id = bs.id
  WHERE bs.tournament_id = 'd26feef0-7dee-4eba-aa8b-d36df42b30f7'
    AND bs.status = 'PENDING'
  GROUP BY bs.id, bs.type
)
UPDATE bet_slips 
SET status = ss.derived_status,
    settled_at = now(),
    actual_payout_tokens = ss.total_payout
FROM slip_statuses ss
WHERE bet_slips.id = ss.id;
```

### Edge function change (Part 2)

In `settle-predictions/index.ts`, after the main settlement loop, add a section that:
1. Collects all unique `bet_slip_id` values from the settled predictions
2. For each, queries all its predictions to derive the aggregate status
3. Updates the bet_slip row

## Files to modify

| File | Change |
|------|--------|
| Database (migration) | One-time SQL to sync 90 BETA TESTING bet_slips |
| `supabase/functions/settle-predictions/index.ts` | Add bet_slip status sync after settling predictions |

