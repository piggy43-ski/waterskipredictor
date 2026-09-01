-- ============ BUG 1: fantasy roster + budget enforcement ============

CREATE OR REPLACE FUNCTION public.fantasy_roster_limit(p_discipline text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (value::jsonb ->> p_discipline)::int FROM public.fantasy_config WHERE key = 'roster_limits'),
    CASE p_discipline WHEN 'slalom' THEN 6 WHEN 'trick' THEN 4 WHEN 'jump' THEN 5 ELSE 0 END
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fantasy_roster_limit(text) FROM anon, authenticated;

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
  v_budget int;
  v_total int;
  v_label text;
BEGIN
  SELECT CASE WHEN lower(COALESCE(a.gender, '')) IN ('male','m','men') THEN 'men' ELSE 'women' END
    INTO v_gender
  FROM public.athletes a WHERE a.id = NEW.athlete_id;

  v_limit := public.fantasy_roster_limit(NEW.discipline);

  SELECT count(*) INTO v_count
  FROM public.fantasy_entry_athletes fea
  JOIN public.athletes a ON a.id = fea.athlete_id
  WHERE fea.entry_id = NEW.entry_id
    AND fea.discipline = NEW.discipline
    AND fea.id IS DISTINCT FROM NEW.id
    AND (CASE WHEN lower(COALESCE(a.gender, '')) IN ('male','m','men') THEN 'men' ELSE 'women' END) = v_gender;

  IF v_count >= v_limit THEN
    v_label := initcap(NEW.discipline) || ' (' || v_gender || ')';
    RAISE EXCEPTION '% is full — % of % picked', v_label, v_count, v_limit
      USING ERRCODE = 'check_violation';
  END IF;

  -- Budget check against THIS pot's team_budget
  SELECT fp.team_budget INTO v_budget
  FROM public.fantasy_entries fe
  JOIN public.fantasy_pots fp ON fp.id = fe.pot_id
  WHERE fe.id = NEW.entry_id;

  SELECT COALESCE(sum(price_at_selection), 0) INTO v_total
  FROM public.fantasy_entry_athletes
  WHERE entry_id = NEW.entry_id AND id IS DISTINCT FROM NEW.id;

  v_total := v_total + NEW.price_at_selection;

  IF v_budget IS NOT NULL AND v_total > v_budget THEN
    RAISE EXCEPTION 'Over budget — this pick would take your team to % of % tokens', v_total, v_budget
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_fantasy_roster_limits ON public.fantasy_entry_athletes;
CREATE TRIGGER trg_enforce_fantasy_roster_limits
BEFORE INSERT OR UPDATE ON public.fantasy_entry_athletes
FOR EACH ROW EXECUTE FUNCTION public.enforce_fantasy_roster_limits();

-- Keep totals + remaining budget correct on the entry
CREATE OR REPLACE FUNCTION public.sync_fantasy_entry_budget()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry uuid := COALESCE(NEW.entry_id, OLD.entry_id);
  v_total int;
  v_budget int;
BEGIN
  SELECT COALESCE(sum(price_at_selection), 0) INTO v_total
  FROM public.fantasy_entry_athletes WHERE entry_id = v_entry;

  SELECT fp.team_budget INTO v_budget
  FROM public.fantasy_entries fe
  JOIN public.fantasy_pots fp ON fp.id = fe.pot_id
  WHERE fe.id = v_entry;

  UPDATE public.fantasy_entries
  SET total_team_value = v_total,
      remaining_budget = COALESCE(v_budget, remaining_budget + total_team_value) - v_total
  WHERE id = v_entry;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_fantasy_entry_budget() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_fantasy_entry_budget ON public.fantasy_entry_athletes;
CREATE TRIGGER trg_sync_fantasy_entry_budget
AFTER INSERT OR UPDATE OR DELETE ON public.fantasy_entry_athletes
FOR EACH ROW EXECUTE FUNCTION public.sync_fantasy_entry_budget();

-- New entries start with the pot's budget, not the global default
CREATE OR REPLACE FUNCTION public.default_fantasy_entry_budget()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_budget int;
BEGIN
  SELECT team_budget INTO v_budget FROM public.fantasy_pots WHERE id = NEW.pot_id;
  IF v_budget IS NOT NULL THEN
    IF COALESCE(NEW.total_team_value, 0) > v_budget THEN
      RAISE EXCEPTION 'Over budget — team value % exceeds this league budget of % tokens', NEW.total_team_value, v_budget
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.remaining_budget := v_budget - COALESCE(NEW.total_team_value, 0);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.default_fantasy_entry_budget() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_default_fantasy_entry_budget ON public.fantasy_entries;
CREATE TRIGGER trg_default_fantasy_entry_budget
BEFORE INSERT OR UPDATE OF total_team_value, pot_id ON public.fantasy_entries
FOR EACH ROW EXECUTE FUNCTION public.default_fantasy_entry_budget();

-- ============ BUG 2: settlement guard ============

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
  WHERE p.tournament_id = NEW.id AND p.status = 'PENDING';

  IF v_pending > 0 THEN
    RAISE EXCEPTION 'Cannot mark tournament % settled: % prediction(s) are still PENDING. Settle or void them first.', NEW.id, v_pending
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_settlement_completeness ON public.tournaments;
CREATE TRIGGER trg_enforce_settlement_completeness
BEFORE UPDATE ON public.tournaments
FOR EACH ROW EXECUTE FUNCTION public.enforce_settlement_completeness();