-- Defense-in-depth trigger on predictions for parlay legs.
-- Mirrors the build-time check in src/utils/parlayMultipliers.ts (Fix 1)
-- and extends enforce_chalk_concentration_cap to parlays (Fix 2).
-- Single entries are not affected here (the existing enforce_chalk_cap
-- trigger on bet_slips continues to cover them).

CREATE OR REPLACE FUNCTION public.enforce_parlay_leg_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_clean_text text;
  v_clean_uuid uuid;
  v_athlete_id uuid;
  v_market_id uuid;
  v_multiplier numeric;
  v_slip_type text;
  v_slip_stake integer;
  v_dup_exists boolean;
BEGIN
  IF NEW.bet_slip_id IS NULL OR NEW.selection_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Strip the synthetic '-podium' suffix, then attempt uuid cast.
  v_clean_text := regexp_replace(NEW.selection_id, '-podium$', '');
  BEGIN
    v_clean_uuid := v_clean_text::uuid;
  EXCEPTION WHEN others THEN
    RETURN NEW;  -- non-uuid selection_id: nothing to enforce
  END;

  -- Resolve underlying athlete + market for this leg via selections.
  SELECT s.athlete_id, s.market_id
    INTO v_athlete_id, v_market_id
    FROM public.selections s
   WHERE s.id = v_clean_uuid
   LIMIT 1;

  IF v_athlete_id IS NULL THEN
    RETURN NEW;  -- unknown selection; let other checks handle it
  END IF;

  -- Parent slip context (parlay vs single, total stake).
  SELECT type, total_stake_tokens
    INTO v_slip_type, v_slip_stake
    FROM public.bet_slips
   WHERE id = NEW.bet_slip_id;

  IF v_slip_type IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only parlay legs are governed by this trigger; singles use
  -- enforce_chalk_concentration_cap on bet_slips.
  IF v_slip_type <> 'parlay' THEN
    RETURN NEW;
  END IF;

  ---------------------------------------------------------------
  -- FIX 1: same-athlete-in-same-slot block.
  --   For sibling legs already inserted for this slip in the same
  --   discipline+category, resolve their athlete via selections and
  --   reject if any share NEW's athlete_id.
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
            HINT = format('athlete_id=%s slot=%s/%s', v_athlete_id, NEW.discipline, NEW.category);
  END IF;

  ---------------------------------------------------------------
  -- FIX 2: chalk concentration cap for parlay legs.
  --   Effective multiplier = COALESCE(override.manual_multiplier WHERE is_enabled,
  --                                   market_odds.final_decimal_odds latest)
  --   If <= 1.5x and parent slip stake > 2500 → reject.
  ---------------------------------------------------------------
  IF v_market_id IS NOT NULL AND v_slip_stake IS NOT NULL THEN
    SELECT COALESCE(
      (SELECT manual_multiplier
         FROM public.market_multiplier_overrides
        WHERE market_id = v_market_id
          AND athlete_id = v_athlete_id
          AND is_enabled = true
        LIMIT 1),
      (SELECT final_decimal_odds
         FROM public.market_odds
        WHERE market_id = v_market_id
          AND athlete_id = v_athlete_id
        ORDER BY generated_at DESC NULLS LAST
        LIMIT 1)
    ) INTO v_multiplier;

    IF v_multiplier IS NOT NULL
       AND v_multiplier <= 1.5
       AND v_slip_stake > 2500 THEN
      RAISE EXCEPTION 'entry_not_allowed'
        USING ERRCODE = 'P0001',
              HINT = format('parlay_leg multiplier=%s stake=%s', v_multiplier, v_slip_stake);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_parlay_leg_rules_trigger ON public.predictions;
CREATE TRIGGER enforce_parlay_leg_rules_trigger
BEFORE INSERT ON public.predictions
FOR EACH ROW EXECUTE FUNCTION public.enforce_parlay_leg_rules();