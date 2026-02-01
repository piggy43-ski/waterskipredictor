-- 1. Create rebuild function for market_liability
CREATE OR REPLACE FUNCTION rebuild_market_liability()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Clear stale data
  TRUNCATE market_liability;
  
  -- Rebuild from pending bet_slips only
  INSERT INTO market_liability (
    market_id,
    athlete_id,
    total_stake_tokens,
    total_potential_payout,
    bet_count,
    liability_if_wins
  )
  SELECT 
    market_id,
    athlete_id,
    SUM(total_stake_tokens) as total_stake_tokens,
    SUM(potential_payout_tokens) as total_potential_payout,
    COUNT(*) as bet_count,
    SUM(potential_payout_tokens) - SUM(total_stake_tokens) as liability_if_wins
  FROM bet_slips
  WHERE status = 'pending'
  GROUP BY market_id, athlete_id;
END;
$$;

-- 2. Add settlement cleanup trigger function
CREATE OR REPLACE FUNCTION cleanup_liability_on_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- When bet_slip status changes from pending to settled/void
  IF OLD.status = 'pending' AND NEW.status IN ('settled', 'won', 'lost', 'void') THEN
    -- Decrement liability for this market/athlete
    UPDATE market_liability 
    SET 
      total_stake_tokens = GREATEST(0, total_stake_tokens - OLD.total_stake_tokens),
      total_potential_payout = GREATEST(0, total_potential_payout - OLD.potential_payout_tokens),
      bet_count = GREATEST(0, bet_count - 1),
      liability_if_wins = GREATEST(0, liability_if_wins - (OLD.potential_payout_tokens - OLD.total_stake_tokens)),
      updated_at = now()
    WHERE market_id = OLD.market_id AND athlete_id = OLD.athlete_id;
    
    -- Remove row if no bets left
    DELETE FROM market_liability 
    WHERE market_id = OLD.market_id 
      AND athlete_id = OLD.athlete_id 
      AND bet_count <= 0;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 3. Create the trigger
DROP TRIGGER IF EXISTS trigger_cleanup_liability_on_settlement ON bet_slips;
CREATE TRIGGER trigger_cleanup_liability_on_settlement
AFTER UPDATE ON bet_slips
FOR EACH ROW
EXECUTE FUNCTION cleanup_liability_on_settlement();

-- 4. Clear stale liability data immediately
TRUNCATE market_liability;