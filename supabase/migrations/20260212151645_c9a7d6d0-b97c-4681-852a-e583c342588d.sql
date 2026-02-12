
-- Temporarily disable immutability trigger
ALTER TABLE bet_slips DISABLE TRIGGER enforce_bet_slip_immutability_trigger;

-- Sync bet_slips status from settled predictions for BETA TESTING tournament
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

-- Re-enable immutability trigger
ALTER TABLE bet_slips ENABLE TRIGGER enforce_bet_slip_immutability_trigger;
