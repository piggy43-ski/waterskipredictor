
CREATE OR REPLACE FUNCTION public.enforce_bet_slip_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only allow status and settlement fields to be updated
  -- All other fields must remain unchanged after creation
  IF OLD.user_id IS DISTINCT FROM NEW.user_id OR
     OLD.tournament_id IS DISTINCT FROM NEW.tournament_id OR
     OLD.market_id IS DISTINCT FROM NEW.market_id OR
     OLD.athlete_id IS DISTINCT FROM NEW.athlete_id OR
     OLD.total_stake_tokens IS DISTINCT FROM NEW.total_stake_tokens OR
     OLD.total_odds_decimal IS DISTINCT FROM NEW.total_odds_decimal OR
     OLD.total_odds_american IS DISTINCT FROM NEW.total_odds_american OR
     OLD.potential_payout_tokens IS DISTINCT FROM NEW.potential_payout_tokens OR
     OLD.type IS DISTINCT FROM NEW.type OR
     OLD.leg_count IS DISTINCT FROM NEW.leg_count OR
     OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'Bet slip records are immutable. Only status and settlement fields can be updated.';
  END IF;
  
  -- Only admins or service role (backend) can update status from PENDING to settled states
  IF OLD.status = 'PENDING' AND NEW.status NOT IN ('PENDING', 'CANCELLED') THEN
    IF NOT (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR auth.uid() IS NULL  -- service role / backend process
    ) THEN
      RAISE EXCEPTION 'Only administrators can settle bet slips.';
    END IF;
  END IF;
  
  -- Prevent modification of already settled bets
  IF OLD.status IN ('WON', 'LOST', 'VOID', 'SETTLED') THEN
    RAISE EXCEPTION 'Cannot modify an already settled bet slip.';
  END IF;
  
  RETURN NEW;
END;
$function$;
