-- Step 1: Drop the existing constraint that only allows 'admin' and 'system'
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_type_check;

-- Step 2: Re-add the constraint to also allow 'user'
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_actor_type_check 
  CHECK (actor_type IN ('admin', 'system', 'user'));

-- Step 3: Update the trigger function to properly classify actor_type
CREATE OR REPLACE FUNCTION public.audit_bet_slip_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_type TEXT;
  v_actor_id UUID;
BEGIN
  -- Determine actor_type based on context
  v_actor_id := auth.uid();
  
  IF v_actor_id IS NULL THEN
    -- No authenticated user (service role / backend process)
    v_actor_type := 'system';
  ELSIF public.has_role(v_actor_id, 'admin'::app_role) THEN
    v_actor_type := 'admin';
  ELSE
    v_actor_type := 'user';
  END IF;

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
      v_actor_type,
      v_actor_id,
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
      v_actor_type,
      v_actor_id,
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
      v_actor_type,
      v_actor_id,
      to_jsonb(OLD),
      NULL,
      jsonb_build_object('reason', 'user_deletion', 'stake', OLD.total_stake_tokens)
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;