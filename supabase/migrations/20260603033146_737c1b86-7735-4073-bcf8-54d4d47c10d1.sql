-- Allow PODIUM and HIGHEST_SCORE markets to be parlay legs.
-- Keeps all other safety checks in enforce_parlay_leg_rules (chalk concentration
-- cap, unresolved-selection guard for stakes > 2500). Drops the same-athlete-
-- in-same-slot block per operator request.
-- enforce_podium_single_stake_cap (1000 token cap on podium stakes) is unchanged.

CREATE OR REPLACE FUNCTION public.enforce_parlay_leg_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clean_text  text;
  v_clean_uuid  uuid;
  v_athlete_id  uuid;
  v_market_id   uuid;
  v_market_type text;
  v_multiplier  numeric;
  v_slip_type   text;
  v_slip_stake  integer;
  v_chalk_threshold constant integer := 2500;
  v_has_chalky_override boolean;
BEGIN
  IF NEW.bet_slip_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT type, total_stake_tokens
    INTO v_slip_type, v_slip_stake
    FROM public.bet_slips
   WHERE id = NEW.bet_slip_id;

  IF v_slip_type IS NULL OR v_slip_type <> 'parlay' THEN
    RETURN NEW;
  END IF;

  IF NEW.selection_id IS NULL THEN
    IF v_slip_stake IS NOT NULL AND v_slip_stake > v_chalk_threshold THEN
      RAISE EXCEPTION 'entry_not_allowed'
        USING ERRCODE = 'P0001',
              HINT = format('parlay_leg unresolved_selection stake=%s', v_slip_stake);
    END IF;
    RETURN NEW;
  END IF;

  v_clean_text := regexp_replace(NEW.selection_id, '-podium$', '');
  BEGIN
    v_clean_uuid := v_clean_text::uuid;
  EXCEPTION WHEN others THEN
    IF v_slip_stake IS NOT NULL AND v_slip_stake > v_chalk_threshold THEN
      RAISE EXCEPTION 'entry_not_allowed'
        USING ERRCODE = 'P0001',
              HINT = format('parlay_leg unresolved_selection_format stake=%s', v_slip_stake);
    END IF;
    RETURN NEW;
  END;

  -- Resolve athlete + market + market_type for this leg.
  -- Composite '<uuid>-podium' rows won't match a selections row; that's OK,
  -- they're synthetic podium-exact-order legs and are now allowed in parlays.
  SELECT s.athlete_id, s.market_id, m.market_type
    INTO v_athlete_id, v_market_id, v_market_type
    FROM public.selections s
    JOIN public.markets m ON m.id = s.market_id
   WHERE s.id = v_clean_uuid
   LIMIT 1;

  -- PODIUM and HIGHEST_SCORE are now ALLOWED as parlay legs (operator change).
  -- The 1000-token podium stake cap (enforce_podium_single_stake_cap) still applies.

  IF v_athlete_id IS NULL THEN
    -- Synthetic podium row or athlete missing — allow if stake is below chalk threshold.
    IF v_slip_stake IS NOT NULL AND v_slip_stake > v_chalk_threshold
       AND NEW.selection_id NOT LIKE '%-podium' THEN
      RAISE EXCEPTION 'entry_not_allowed'
        USING ERRCODE = 'P0001',
              HINT = format('parlay_leg unresolved_athlete selection_id=%s stake=%s',
                            NEW.selection_id, v_slip_stake);
    END IF;
    RETURN NEW;
  END IF;

  -- Same-athlete-in-same-slot block removed per operator request.

  -- Chalk concentration cap for parlay legs (kept).
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

  IF v_multiplier IS NULL THEN
    IF v_slip_stake IS NOT NULL AND v_slip_stake > v_chalk_threshold THEN
      RAISE EXCEPTION 'entry_not_allowed'
        USING ERRCODE = 'P0001',
              HINT = format('parlay_leg unresolved_multiplier athlete=%s market=%s stake=%s',
                            v_athlete_id, v_market_id, v_slip_stake);
    END IF;
    RETURN NEW;
  END IF;

  IF v_multiplier <= 1.5
     AND v_slip_stake IS NOT NULL
     AND v_slip_stake > v_chalk_threshold THEN
    RAISE EXCEPTION 'entry_not_allowed'
      USING ERRCODE = 'P0001',
            HINT = format('parlay_leg multiplier=%s stake=%s', v_multiplier, v_slip_stake);
  END IF;

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
$function$;
