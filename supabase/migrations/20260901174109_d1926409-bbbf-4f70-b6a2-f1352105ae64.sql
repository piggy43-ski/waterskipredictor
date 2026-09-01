CREATE OR REPLACE FUNCTION public.enforce_settlement_completeness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_results int;
  v_pending int;
  v_becoming_settled boolean;
BEGIN
  v_becoming_settled :=
    (NEW.settled_at IS NOT NULL AND OLD.settled_at IS NULL)
    OR (COALESCE(NEW.status,'') IN ('finished','settled')
        AND COALESCE(OLD.status,'') NOT IN ('finished','settled'));

  IF NOT v_becoming_settled THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_results
  FROM public.tournament_results WHERE tournament_id = NEW.id;

  IF v_results = 0 THEN
    RAISE EXCEPTION 'Cannot mark tournament % settled: it has 0 rows in tournament_results. Load official results first.', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_pending
  FROM public.predictions p
  JOIN public.bet_slips bs ON bs.id = p.bet_slip_id
  WHERE bs.tournament_id = NEW.id AND p.status = 'PENDING';

  IF v_pending > 0 THEN
    RAISE EXCEPTION 'Cannot mark tournament % settled: % prediction(s) are still PENDING. Settle or void them first.', NEW.id, v_pending
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;