CREATE OR REPLACE FUNCTION public.rebuild_market_liability()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Clear stale data
  TRUNCATE market_liability;
  
  -- Rebuild from pending bet_slips only (uppercase PENDING to match app data)
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
  WHERE status = 'PENDING'
  GROUP BY market_id, athlete_id;
END;
$function$;