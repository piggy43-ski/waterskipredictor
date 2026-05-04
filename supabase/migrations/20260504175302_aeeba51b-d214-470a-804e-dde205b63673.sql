
CREATE OR REPLACE FUNCTION public.cleanup_liability_on_settlement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status IN ('PENDING','SETTLING') AND NEW.status IN ('WON', 'LOST', 'VOID', 'CANCELLED') THEN
    UPDATE market_liability 
    SET 
      total_stake_tokens = GREATEST(0, total_stake_tokens - OLD.total_stake_tokens),
      total_potential_payout = GREATEST(0, total_potential_payout - OLD.potential_payout_tokens),
      bet_count = GREATEST(0, bet_count - 1),
      liability_if_wins = GREATEST(0, liability_if_wins - (OLD.potential_payout_tokens - OLD.total_stake_tokens)),
      updated_at = now()
    WHERE market_id = OLD.market_id AND athlete_id = OLD.athlete_id;
    
    DELETE FROM market_liability 
    WHERE market_id = OLD.market_id 
      AND athlete_id = OLD.athlete_id 
      AND bet_count <= 0;
  END IF;
  
  RETURN NEW;
END;
$function$;
