-- =============================================
-- Security Fix: Make bet_slips records immutable
-- =============================================

-- 1. Create a trigger function to prevent modification of critical bet fields
-- This ensures betting data cannot be manipulated after placement
CREATE OR REPLACE FUNCTION public.enforce_bet_slip_immutability()
RETURNS TRIGGER AS $$
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
  
  -- Only admins can update status from PENDING to settled states
  -- Users can only cancel their own pending bets (if allowed)
  IF OLD.status = 'PENDING' AND NEW.status NOT IN ('PENDING', 'CANCELLED') THEN
    IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Only administrators can settle bet slips.';
    END IF;
  END IF;
  
  -- Prevent modification of already settled bets
  IF OLD.status IN ('WON', 'LOST', 'VOID', 'SETTLED') THEN
    RAISE EXCEPTION 'Cannot modify an already settled bet slip.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Create trigger for bet_slips immutability
DROP TRIGGER IF EXISTS enforce_bet_slip_immutability_trigger ON public.bet_slips;
CREATE TRIGGER enforce_bet_slip_immutability_trigger
  BEFORE UPDATE ON public.bet_slips
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_bet_slip_immutability();

-- 3. Create audit logging for bet_slips access and modifications
CREATE OR REPLACE FUNCTION public.audit_bet_slip_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (
      entity_type,
      entity_id,
      action_type,
      actor_type,
      actor_id,
      before_state,
      after_state,
      metadata
    ) VALUES (
      'bet_slip',
      NEW.id::text,
      'CREATE',
      CASE WHEN public.has_role(auth.uid(), 'admin'::app_role) THEN 'admin' ELSE 'user' END,
      auth.uid(),
      NULL,
      to_jsonb(NEW),
      jsonb_build_object('tournament_id', NEW.tournament_id, 'stake', NEW.total_stake_tokens)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (
      entity_type,
      entity_id,
      action_type,
      actor_type,
      actor_id,
      before_state,
      after_state,
      metadata
    ) VALUES (
      'bet_slip',
      NEW.id::text,
      CASE 
        WHEN OLD.status != NEW.status THEN 'STATUS_CHANGE'
        ELSE 'UPDATE'
      END,
      CASE WHEN public.has_role(auth.uid(), 'admin'::app_role) THEN 'admin' ELSE 'user' END,
      auth.uid(),
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object(
        'old_status', OLD.status, 
        'new_status', NEW.status,
        'actual_payout', NEW.actual_payout_tokens
      )
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (
      entity_type,
      entity_id,
      action_type,
      actor_type,
      actor_id,
      before_state,
      after_state,
      metadata
    ) VALUES (
      'bet_slip',
      OLD.id::text,
      'DELETE',
      CASE WHEN public.has_role(auth.uid(), 'admin'::app_role) THEN 'admin' ELSE 'user' END,
      auth.uid(),
      to_jsonb(OLD),
      NULL,
      jsonb_build_object('reason', 'user_deletion', 'stake', OLD.total_stake_tokens)
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Create audit trigger for bet_slips
DROP TRIGGER IF EXISTS audit_bet_slip_changes_trigger ON public.bet_slips;
CREATE TRIGGER audit_bet_slip_changes_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.bet_slips
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_bet_slip_changes();

-- 5. Remove direct user DELETE access - users should not be able to delete bet slips
-- Only allow cancellation through status update
DROP POLICY IF EXISTS "Users can delete their own bet slips" ON public.bet_slips;

-- 6. Update user UPDATE policy to be more restrictive
-- Users can only update status to CANCELLED on their own PENDING bets
DROP POLICY IF EXISTS "Users can update their own bet slips" ON public.bet_slips;
CREATE POLICY "Users can cancel their own pending bet slips"
  ON public.bet_slips
  FOR UPDATE
  USING (auth.uid() = user_id AND status = 'PENDING')
  WITH CHECK (auth.uid() = user_id AND status = 'CANCELLED');

-- Add comment explaining the security model
COMMENT ON TRIGGER enforce_bet_slip_immutability_trigger ON public.bet_slips IS 
  'Enforces immutability of bet slip records - only status and settlement fields can be modified after creation';

COMMENT ON TRIGGER audit_bet_slip_changes_trigger ON public.bet_slips IS 
  'Comprehensive audit logging for all bet slip operations including access by admins';