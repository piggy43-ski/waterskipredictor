
-- 1. Add columns to tournaments
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS max_handle_tokens BIGINT,
  ADD COLUMN IF NOT EXISTS current_handle_tokens BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS handle_warning_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.80;

COMMENT ON COLUMN public.tournaments.max_handle_tokens IS
  'Maximum total prediction handle (sum of stakes) for the event. NULL = no cap.';
COMMENT ON COLUMN public.tournaments.current_handle_tokens IS
  'Running total of staked tokens across all entries for this tournament. Updated atomically by trigger on bet_slips insert.';
COMMENT ON COLUMN public.tournaments.handle_warning_threshold IS
  'Fraction of max_handle_tokens at which a warning alert fires (default 0.80).';

-- 2. risk_alerts table
CREATE TABLE IF NOT EXISTS public.risk_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  tournament_id UUID,
  market_id UUID,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_alerts_unack ON public.risk_alerts(acknowledged, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_tournament ON public.risk_alerts(tournament_id);

ALTER TABLE public.risk_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view risk alerts"
  ON public.risk_alerts FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update risk alerts"
  ON public.risk_alerts FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete risk alerts"
  ON public.risk_alerts FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can insert risk alerts"
  ON public.risk_alerts FOR INSERT
  WITH CHECK (true);

-- 3. Trigger function: atomic handle increment + cap enforcement
CREATE OR REPLACE FUNCTION public.enforce_event_handle_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max BIGINT;
  v_threshold NUMERIC;
  v_prev BIGINT;
  v_new BIGINT;
  v_warn_at BIGINT;
BEGIN
  IF NEW.tournament_id IS NULL OR NEW.total_stake_tokens IS NULL OR NEW.total_stake_tokens <= 0 THEN
    RETURN NEW;
  END IF;

  -- Atomic increment with row lock; returns new and max
  UPDATE public.tournaments
     SET current_handle_tokens = current_handle_tokens + NEW.total_stake_tokens
   WHERE id = NEW.tournament_id
  RETURNING current_handle_tokens - NEW.total_stake_tokens,
           current_handle_tokens,
           max_handle_tokens,
           handle_warning_threshold
    INTO v_prev, v_new, v_max, v_threshold;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_max IS NOT NULL AND v_new > v_max THEN
    RAISE EXCEPTION 'event_at_capacity'
      USING ERRCODE = 'P0001',
            HINT = format('current=%s max=%s attempted=%s', v_prev, v_max, NEW.total_stake_tokens);
  END IF;

  IF v_max IS NOT NULL AND v_threshold IS NOT NULL THEN
    v_warn_at := FLOOR(v_max::numeric * v_threshold);
    IF v_prev < v_warn_at AND v_new >= v_warn_at THEN
      INSERT INTO public.risk_alerts (alert_type, severity, tournament_id, message, metadata)
      VALUES (
        'event_handle_warning',
        'warning',
        NEW.tournament_id,
        format('Event handle crossed %s%% of cap (%s / %s tokens)',
               (v_threshold * 100)::int, v_new, v_max),
        jsonb_build_object(
          'current_handle_tokens', v_new,
          'max_handle_tokens', v_max,
          'threshold', v_threshold,
          'triggering_bet_slip_id', NEW.id
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_event_handle_cap ON public.bet_slips;
CREATE TRIGGER trg_enforce_event_handle_cap
  BEFORE INSERT ON public.bet_slips
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_event_handle_cap();

-- 4. Backfill current_handle_tokens from existing non-cancelled slips
UPDATE public.tournaments t
   SET current_handle_tokens = COALESCE(s.total, 0)
  FROM (
    SELECT tournament_id, SUM(total_stake_tokens)::bigint AS total
      FROM public.bet_slips
     WHERE status <> 'CANCELLED'
     GROUP BY tournament_id
  ) s
 WHERE s.tournament_id = t.id;

-- 5. Apply Masters cap
UPDATE public.tournaments
   SET max_handle_tokens = 100000
 WHERE id = '46e43622-d8e8-433d-b0eb-74c841419a48';
