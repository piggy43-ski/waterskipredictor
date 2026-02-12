
-- Part 1: Fix Ross Charlie WINNER settlement
-- Temporarily disable immutability trigger
ALTER TABLE bet_slips DISABLE TRIGGER enforce_bet_slip_immutability_trigger;

-- 1. Flip 9 Ross Charlie WINNER predictions from WON to LOST
UPDATE predictions
SET status = 'LOST', payout_tokens = 0, settled_at = now()
WHERE selection_id = '0febde69-2dbe-4e41-8f0c-86963052e8cc'
  AND status = 'WON';

-- 2. Claw back incorrectly paid tokens (total: 1,413)
-- User 5ba913f1: -750 (two predictions: 750 + 0)
UPDATE token_wallets SET earned_tokens = earned_tokens - 750, updated_at = now()
WHERE user_id = '5ba913f1-8fb8-4932-a9b4-4a41f4d6d82a';

-- User 2e5fddae: -300
UPDATE token_wallets SET earned_tokens = earned_tokens - 300, updated_at = now()
WHERE user_id = '2e5fddae-ebab-4256-815b-a0d2c10ac575';

-- User 1d55ad8f: -150
UPDATE token_wallets SET earned_tokens = earned_tokens - 150, updated_at = now()
WHERE user_id = '1d55ad8f-9eff-4348-ac13-055d4e8eca71';

-- User 5b9f6c93: -90
UPDATE token_wallets SET earned_tokens = earned_tokens - 90, updated_at = now()
WHERE user_id = '5b9f6c93-4dcd-46d3-8a4b-3a7dd7a859b7';

-- User d731a1aa: -33
UPDATE token_wallets SET earned_tokens = earned_tokens - 33, updated_at = now()
WHERE user_id = 'd731a1aa-f10f-4d00-bdba-e1334b132f3a';

-- User b9920bcb: -30
UPDATE token_wallets SET earned_tokens = earned_tokens - 30, updated_at = now()
WHERE user_id = 'b9920bcb-b9b3-497b-84c6-14afa9d9c02b';

-- User 5f88e8c3: -30
UPDATE token_wallets SET earned_tokens = earned_tokens - 30, updated_at = now()
WHERE user_id = '5f88e8c3-f95d-4b49-a355-59a548181e15';

-- User 45238524: -30
UPDATE token_wallets SET earned_tokens = earned_tokens - 30, updated_at = now()
WHERE user_id = '45238524-4ce1-4ef8-8440-57aff17088a1';

-- 3. Re-derive parent bet_slip statuses for affected entries
-- These bet_slips had Ross Charlie WINNER predictions
WITH affected_slips AS (
  SELECT DISTINCT bet_slip_id FROM predictions
  WHERE selection_id = '0febde69-2dbe-4e41-8f0c-86963052e8cc'
),
slip_statuses AS (
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
  WHERE bs.id IN (SELECT bet_slip_id FROM affected_slips)
  GROUP BY bs.id, bs.type
)
UPDATE bet_slips 
SET status = ss.derived_status,
    settled_at = now(),
    actual_payout_tokens = ss.total_payout
FROM slip_statuses ss
WHERE bet_slips.id = ss.id;

-- 4. Void 3 orphan bet_slips (no child predictions)
UPDATE bet_slips SET status = 'VOID', settled_at = now()
WHERE id IN (
  '8605912b-4bc2-4106-8f1e-98714000cb2f',
  '16f832f2-e622-4a62-988d-9d5bbad0330f',
  '417d46e9-b139-4812-ba6b-6f7e2efc98d8'
);

-- Re-enable immutability trigger
ALTER TABLE bet_slips ENABLE TRIGGER enforce_bet_slip_immutability_trigger;
