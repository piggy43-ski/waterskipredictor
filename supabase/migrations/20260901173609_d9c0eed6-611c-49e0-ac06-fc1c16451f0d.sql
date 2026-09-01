-- 1) Fantasy roster limits (per discipline, per gender)
CREATE OR REPLACE FUNCTION public.enforce_fantasy_roster_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gender text;
  v_limit int;
  v_count int;
BEGIN
  SELECT lower(coalesce(a.gender, '')) INTO v_gender
  FROM public.athletes a WHERE a.id = NEW.athlete_id;

  IF v_gender IN ('male', 'm', 'men') THEN
    v_gender := 'men';
  ELSE
    v_gender := 'women';
  END IF;

  v_limit := CASE NEW.discipline
    WHEN 'slalom' THEN 6
    WHEN 'trick' THEN 4
    WHEN 'jump' THEN 5
    ELSE 0
  END;

  SELECT count(*) INTO v_count
  FROM public.fantasy_entry_athletes fea
  JOIN public.athletes a ON a.id = fea.athlete_id
  WHERE fea.entry_id = NEW.entry_id
    AND fea.discipline = NEW.discipline
    AND (CASE WHEN lower(coalesce(a.gender, '')) IN ('male','m','men') THEN 'men' ELSE 'women' END) = v_gender;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Roster limit reached: % % already has % of % allowed', v_gender, NEW.discipline, v_count, v_limit
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_fantasy_roster_limits ON public.fantasy_entry_athletes;
CREATE TRIGGER trg_enforce_fantasy_roster_limits
BEFORE INSERT ON public.fantasy_entry_athletes
FOR EACH ROW EXECUTE FUNCTION public.enforce_fantasy_roster_limits();

-- 2) Settlement completeness guard on tournaments
CREATE OR REPLACE FUNCTION public.enforce_settlement_completeness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_results int;
  v_pending int;
BEGIN
  IF NEW.settled_at IS NULL OR OLD.settled_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT (SELECT count(*) FROM public.tournament_results tr WHERE tr.tournament_id = NEW.id)
       + (SELECT count(*) FROM public.market_results mr
            JOIN public.markets m ON m.id = mr.market_id
           WHERE m.tournament_id = NEW.id)
  INTO v_results;

  IF v_results = 0 THEN
    RAISE EXCEPTION 'Cannot mark tournament % settled: no results rows exist', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_pending
  FROM public.predictions p
  JOIN public.bet_slips b ON b.id = p.bet_slip_id
  WHERE b.tournament_id = NEW.id AND p.status = 'PENDING';

  IF v_pending > 0 THEN
    RAISE EXCEPTION 'Cannot mark tournament % settled: % prediction(s) still PENDING', NEW.id, v_pending
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_settlement_completeness ON public.tournaments;
CREATE TRIGGER trg_enforce_settlement_completeness
BEFORE UPDATE OF settled_at ON public.tournaments
FOR EACH ROW EXECUTE FUNCTION public.enforce_settlement_completeness();