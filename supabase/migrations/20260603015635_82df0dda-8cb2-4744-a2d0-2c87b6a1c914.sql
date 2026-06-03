-- ============================================================
-- Royal Nautique Pro — HIGHEST_SCORE markets (Part B only)
-- Target tournament: dad9b595-fa2b-4fbb-a174-1a57efe7951a (verified)
-- Preview migration. No row mutations to existing bet_slips / predictions.
-- ============================================================

-- ---------- 1. Create 4 HIGHEST_SCORE markets, unpublished ----------
INSERT INTO public.markets (tournament_id, discipline, category, market_type, name, is_published)
VALUES
  ('dad9b595-fa2b-4fbb-a174-1a57efe7951a', 'slalom', 'open_men',   'HIGHEST_SCORE', 'Open Men Slalom — Highest Score',   false),
  ('dad9b595-fa2b-4fbb-a174-1a57efe7951a', 'slalom', 'open_women', 'HIGHEST_SCORE', 'Open Women Slalom — Highest Score', false),
  ('dad9b595-fa2b-4fbb-a174-1a57efe7951a', 'trick',  'open_men',   'HIGHEST_SCORE', 'Open Men Tricks — Highest Score',   false),
  ('dad9b595-fa2b-4fbb-a174-1a57efe7951a', 'trick',  'open_women', 'HIGHEST_SCORE', 'Open Women Tricks — Highest Score', false)
ON CONFLICT (tournament_id, discipline, category, market_type) DO NOTHING;

-- ---------- 2. Insert selections (one per entered athlete) ----------
-- Default placeholder odds: men_slalom 10, women_slalom 14, men_tricks 20,
-- women_tricks none-default (3 athletes, all listed in overrides below).
INSERT INTO public.selections (market_id, athlete_id, description, decimal_odds)
SELECT m.id, te.athlete_id,
       a.name || ' — Highest Score',
       CASE
         WHEN m.discipline='slalom' AND m.category='open_men'   THEN 10.0
         WHEN m.discipline='slalom' AND m.category='open_women' THEN 14.0
         WHEN m.discipline='trick'  AND m.category='open_men'   THEN 20.0
         WHEN m.discipline='trick'  AND m.category='open_women' THEN 3.5
       END
FROM public.markets m
JOIN public.tournament_entries te
  ON te.tournament_id = m.tournament_id
 AND te.discipline    = m.discipline
JOIN public.athletes a
  ON a.id = te.athlete_id
 AND ((m.category='open_men' AND a.gender='male')
   OR (m.category='open_women' AND a.gender='female'))
WHERE m.tournament_id = 'dad9b595-fa2b-4fbb-a174-1a57efe7951a'
  AND m.market_type   = 'HIGHEST_SCORE'
ON CONFLICT (market_id, athlete_id) DO NOTHING;

-- ---------- 3. Protected multiplier overrides ----------
-- Helper CTE: resolve (market_id, athlete_id) pairs by discipline/category/name.
WITH targets AS (
  SELECT m.id AS market_id, a.id AS athlete_id, t.multiplier
  FROM (
    VALUES
      -- men slalom
      ('slalom','open_men','Ross Charlie',        1.6),
      ('slalom','open_men','Smith Nate',          3.0),
      ('slalom','open_men','Winter Frederick',    3.5),
      ('slalom','open_men','Mccormick Cole',      5.0),
      ('slalom','open_men','Travers Jonathan',    7.0),
      -- women slalom
      ('slalom','open_women','Bull Jaimee',       1.4),
      ('slalom','open_women','Nicholson Allie',   3.5),
      ('slalom','open_women','Ross Neilly',       4.5),
      ('slalom','open_women','Garcia Alexandra',  8.0),
      -- men tricks
      ('trick','open_men','Gonzalez Matias',      2.0),
      ('trick','open_men','Abelson Jake',         2.2),
      ('trick','open_men','Font Patricio',        4.0),
      ('trick','open_men','Martin Labra',         6.0),
      ('trick','open_men','Font Pablo',          12.0),
      -- women tricks
      ('trick','open_women','Ross Neilly',        1.3),
      ('trick','open_women','Hansen Kennedy',     2.5),
      ('trick','open_women','Stopnicki Hannah',   3.5)
  ) AS t(discipline, category, athlete_name, multiplier)
  JOIN public.markets m
    ON m.tournament_id='dad9b595-fa2b-4fbb-a174-1a57efe7951a'
   AND m.market_type='HIGHEST_SCORE'
   AND m.discipline=t.discipline
   AND m.category=t.category
  JOIN public.athletes a
    ON a.name = t.athlete_name
)
INSERT INTO public.market_multiplier_overrides
  (market_id, athlete_id, manual_multiplier, is_enabled, is_protected, reason)
SELECT market_id, athlete_id, multiplier, true, true, 'highest-score 2026 form'
FROM targets
ON CONFLICT (market_id, athlete_id) DO UPDATE
  SET manual_multiplier = EXCLUDED.manual_multiplier,
      is_protected      = true,
      is_enabled        = true,
      reason            = EXCLUDED.reason,
      updated_at        = now();

-- Sync selections.decimal_odds with overrides for consistent display.
UPDATE public.selections s
SET decimal_odds = o.manual_multiplier, updated_at = now()
FROM public.market_multiplier_overrides o
JOIN public.markets m ON m.id = o.market_id
WHERE s.market_id = o.market_id
  AND s.athlete_id = o.athlete_id
  AND m.tournament_id = 'dad9b595-fa2b-4fbb-a174-1a57efe7951a'
  AND m.market_type = 'HIGHEST_SCORE';

-- ---------- 4. Highest-score resolver ----------
CREATE OR REPLACE FUNCTION public.resolve_highest_score_winner(
  p_tournament_id uuid,
  p_discipline   text,
  p_gender       text
) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_winner uuid;
BEGIN
  IF p_discipline = 'slalom' THEN
    SELECT athlete_id INTO v_winner
    FROM public.tournament_results
    WHERE tournament_id = p_tournament_id
      AND discipline    = 'slalom'
      AND gender        = p_gender
      AND line_length_m IS NOT NULL
    ORDER BY line_length_m ASC NULLS LAST,
             buoys        DESC NULLS LAST
    LIMIT 1;
  ELSIF p_discipline = 'trick' THEN
    SELECT athlete_id INTO v_winner
    FROM public.tournament_results
    WHERE tournament_id = p_tournament_id
      AND discipline    = 'trick'
      AND gender        = p_gender
      AND trick_points  IS NOT NULL
    ORDER BY trick_points DESC NULLS LAST
    LIMIT 1;
  ELSIF p_discipline = 'jump' THEN
    SELECT athlete_id INTO v_winner
    FROM public.tournament_results
    WHERE tournament_id   = p_tournament_id
      AND discipline      = 'jump'
      AND gender          = p_gender
      AND jump_distance_m IS NOT NULL
    ORDER BY jump_distance_m DESC NULLS LAST
    LIMIT 1;
  END IF;
  RETURN v_winner;
END;
$$;

-- ---------- 5. Admin populator (manual) ----------
CREATE OR REPLACE FUNCTION public.populate_highest_score_results(p_tournament_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_market    RECORD;
  v_winner    uuid;
  v_gender    text;
  v_results   jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can populate market results';
  END IF;

  FOR v_market IN
    SELECT id, discipline, category
    FROM public.markets
    WHERE tournament_id = p_tournament_id
      AND market_type   = 'HIGHEST_SCORE'
  LOOP
    v_gender := CASE WHEN v_market.category='open_men' THEN 'male' ELSE 'female' END;
    v_winner := public.resolve_highest_score_winner(p_tournament_id, v_market.discipline, v_gender);

    IF v_winner IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.market_results
         WHERE market_id = v_market.id AND final_rank = 1
       )
    THEN
      INSERT INTO public.market_results(market_id, athlete_id, final_rank)
      VALUES (v_market.id, v_winner, 1);

      v_results := v_results || jsonb_build_object(
        'market_id', v_market.id,
        'discipline', v_market.discipline,
        'category', v_market.category,
        'winner_athlete_id', v_winner
      );
    END IF;
  END LOOP;
  RETURN jsonb_build_object('populated', v_results);
END;
$$;

-- ---------- 6. Parlay leg gate — block PODIUM and HIGHEST_SCORE always ----------
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
  v_dup_exists  boolean;
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

  -- Below-threshold parlays preserve the prior permissive behavior for
  -- unresolved legs (kept from earlier hardening). Market-type gating below
  -- runs unconditionally.

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
  SELECT s.athlete_id, s.market_id, m.market_type
    INTO v_athlete_id, v_market_id, v_market_type
    FROM public.selections s
    JOIN public.markets m ON m.id = s.market_id
   WHERE s.id = v_clean_uuid
   LIMIT 1;

  -- ============================================================
  -- NEW (this migration): Market-type parlay ineligibility gate.
  -- PODIUM and HIGHEST_SCORE markets cannot be added to any parlay,
  -- regardless of stake. Gated unconditionally.
  -- ============================================================
  IF v_market_type IN ('PODIUM','HIGHEST_SCORE') THEN
    RAISE EXCEPTION 'entry_not_allowed'
      USING ERRCODE = 'P0001',
            HINT = format('parlay_market_ineligible market_type=%s', v_market_type);
  END IF;
  -- Also gate composite '-podium' selection_ids whose base uuid happens not
  -- to be present in public.selections (e.g. synthetic podium-exact-order
  -- predictions written with a '<uuid>-podium' suffix).
  IF NEW.selection_id LIKE '%-podium' THEN
    RAISE EXCEPTION 'entry_not_allowed'
      USING ERRCODE = 'P0001',
            HINT = 'parlay_market_ineligible market_type=PODIUM';
  END IF;
  -- ============================================================

  IF v_athlete_id IS NULL THEN
    IF v_slip_stake IS NOT NULL AND v_slip_stake > v_chalk_threshold THEN
      RAISE EXCEPTION 'entry_not_allowed'
        USING ERRCODE = 'P0001',
              HINT = format('parlay_leg unresolved_athlete selection_id=%s stake=%s',
                            NEW.selection_id, v_slip_stake);
    END IF;
    RETURN NEW;
  END IF;

  -- FIX 1: same-athlete-in-same-slot block.
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

  -- FIX 2 (hardened): chalk concentration cap for parlay legs.
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
