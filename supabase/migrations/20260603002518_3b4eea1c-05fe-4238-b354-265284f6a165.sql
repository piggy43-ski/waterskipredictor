-- FIX 2 hardening: close the silent-skip hole in enforce_parlay_leg_rules.
--
-- Previous version early-returned (RETURN NEW) when:
--   * the selection_id couldn't be cast to uuid after stripping '-podium'
--   * the stripped uuid had no row in public.selections (athlete_id null)
--   * market_id couldn't be resolved
--   * neither override nor market_odds produced a multiplier
--
-- Any of those silent skips bypassed the >2500 chalk cap on parlays.
-- This migration replaces those skips with fail-closed REJECTION when the
-- parent parlay's stake is above the cap threshold (2500). Same-athlete
-- duplicate-slot check (FIX 1) is preserved unchanged.

CREATE OR REPLACE FUNCTION public.enforce_parlay_leg_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_clean_text  text;
  v_clean_uuid  uuid;
  v_athlete_id  uuid;
  v_market_id   uuid;
  v_multiplier  numeric;
  v_slip_type   text;
  v_slip_stake  integer;
  v_dup_exists  boolean;
  v_chalk_threshold constant integer := 2500;
  v_has_chalky_override boolean;
BEGIN
  IF NEW.bet_slip_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Parent slip context first; we need to know if this is a parlay and what
  -- the stake is before we can decide whether to fail-closed.
  SELECT type, total_stake_tokens
    INTO v_slip_type, v_slip_stake
    FROM public.bet_slips
   WHERE id = NEW.bet_slip_id;

  IF v_slip_type IS NULL OR v_slip_type <> 'parlay' THEN
    RETURN NEW;  -- singles handled by enforce_chalk_concentration_cap on bet_slips
  END IF;

  -- Helper: above-threshold parlays are subject to fail-closed enforcement.
  -- Below-threshold parlays preserve the prior permissive behavior to avoid
  -- blocking small-stake exploratory entries on legitimately unresolved legs.
  IF NEW.selection_id IS NULL THEN
    IF v_slip_stake IS NOT NULL AND v_slip_stake > v_chalk_threshold THEN
      RAISE EXCEPTION 'entry_not_allowed'
        USING ERRCODE = 'P0001',
              HINT = format('parlay_leg unresolved_selection stake=%s', v_slip_stake);
    END IF;
    RETURN NEW;
  END IF;

  -- Strip the synthetic '-podium' suffix, then attempt uuid cast.
  v_clean_text := regexp_replace(NEW.selection_id, '-podium$', '');
  BEGIN
    v_clean_uuid := v_clean_text::uuid;
  EXCEPTION WHEN others THEN
    -- Non-uuid selection_id: fail-closed if above threshold.
    IF v_slip_stake IS NOT NULL AND v_slip_stake > v_chalk_threshold THEN
      RAISE EXCEPTION 'entry_not_allowed'
        USING ERRCODE = 'P0001',
              HINT = format('parlay_leg unresolved_selection_format stake=%s', v_slip_stake);
    END IF;
    RETURN NEW;
  END;

  -- Resolve underlying athlete + market for this leg via selections.
  SELECT s.athlete_id, s.market_id
    INTO v_athlete_id, v_market_id
    FROM public.selections s
   WHERE s.id = v_clean_uuid
   LIMIT 1;

  -- FAIL-CLOSED (a): selection row missing OR athlete unresolved.
  -- PODIUM composite selection_ids whose base uuid is not present in
  -- public.selections previously fell through here silently.
  IF v_athlete_id IS NULL THEN
    IF v_slip_stake IS NOT NULL AND v_slip_stake > v_chalk_threshold THEN
      RAISE EXCEPTION 'entry_not_allowed'
        USING ERRCODE = 'P0001',
              HINT = format('parlay_leg unresolved_athlete selection_id=%s stake=%s',
                            NEW.selection_id, v_slip_stake);
    END IF;
    RETURN NEW;
  END IF;

  ---------------------------------------------------------------
  -- FIX 1: same-athlete-in-same-slot block (unchanged).
  ---------------------------------------------------------------
  SELECT EXISTS (
    SELECT 1
      FROM public.predictions p
      JOIN public.selections s2
        ON s2.id::text = regexp_replace(p.selection_id, '-podium$', '')
     WHERE p.bet_slip_id = NEW.bet_slip_id
       AND p.discipline  = NEW.discipline
       AND p.category    = NEW.category
       AND s2.athlete_id = v_athlete_id
  ) INTO v_dup_exists;

  IF v_dup_exists THEN
    RAISE EXCEPTION 'athlete_already_in_entry'
      USING ERRCODE = 'P0001',
            HINT = format('athlete_id=%s slot=%s/%s',
                          v_athlete_id, NEW.discipline, NEW.category);
  END IF;

  ---------------------------------------------------------------
  -- FIX 2 (hardened): chalk concentration cap for parlay legs.
  -- Effective multiplier = enabled override OR latest market_odds.
  -- FAIL-CLOSED if above threshold and either:
  --   (a) the leg's market has any enabled <=1.5x override (any athlete), OR
  --   (b) no multiplier can be resolved for this leg at all.
  ---------------------------------------------------------------
  IF v_market_id IS NOT NULL THEN
    SELECT COALESCE(
      (SELECT manual_multiplier
         FROM public.market_multiplier_overrides
        WHERE market_id  = v_market_id
          AND athlete_id = v_athlete_id
          AND is_enabled = true
        LIMIT 1),
      (SELECT final_decimal_odds
         FROM public.market_odds
        WHERE market_id  = v_market_id
          AND athlete_id = v_athlete_id
        ORDER BY generated_at DESC NULLS LAST
        LIMIT 1)
    ) INTO v_multiplier;
  END IF;

  -- (b) Cannot resolve any multiplier for this leg.
  IF v_multiplier IS NULL THEN
    IF v_slip_stake IS NOT NULL AND v_slip_stake > v_chalk_threshold THEN
      RAISE EXCEPTION 'entry_not_allowed'
        USING ERRCODE = 'P0001',
              HINT = format('parlay_leg unresolved_multiplier athlete=%s market=%s stake=%s',
                            v_athlete_id, v_market_id, v_slip_stake);
    END IF;
    RETURN NEW;
  END IF;

  -- Standard cap: this leg's own effective multiplier <=1.5x.
  IF v_multiplier <= 1.5
     AND v_slip_stake IS NOT NULL
     AND v_slip_stake > v_chalk_threshold THEN
    RAISE EXCEPTION 'entry_not_allowed'
      USING ERRCODE = 'P0001',
            HINT = format('parlay_leg multiplier=%s stake=%s', v_multiplier, v_slip_stake);
  END IF;

  -- (a) Defense-in-depth: even if THIS athlete's multiplier > 1.5x, reject
  -- when the leg's market has any other enabled <=1.5x override AND stake
  -- exceeds the threshold. This blocks "ride alongside the lock" exploits.
  IF v_slip_stake IS NOT NULL AND v_slip_stake > v_chalk_threshold THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.market_multiplier_overrides
       WHERE market_id = v_market_id
         AND is_enabled = true
         AND manual_multiplier <= 1.5
    ) INTO v_has_chalky_override;
    IF v_has_chalky_override THEN
      RAISE EXCEPTION 'entry_not_allowed'
        USING ERRCODE = 'P0001',
              HINT = format('parlay_leg chalky_market market=%s stake=%s',
                            v_market_id, v_slip_stake);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
