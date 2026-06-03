
-- 1. Ordering-override table for podium exact-order multipliers
CREATE TABLE IF NOT EXISTS public.market_podium_ordering_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  first_athlete  uuid NOT NULL REFERENCES public.athletes(id),
  second_athlete uuid NOT NULL REFERENCES public.athletes(id),
  third_athlete  uuid NOT NULL REFERENCES public.athletes(id),
  manual_multiplier numeric NOT NULL CHECK (manual_multiplier > 0),
  is_protected boolean NOT NULL DEFAULT false,
  is_enabled boolean NOT NULL DEFAULT true,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, first_athlete, second_athlete, third_athlete)
);

GRANT SELECT ON public.market_podium_ordering_overrides TO authenticated;
GRANT ALL ON public.market_podium_ordering_overrides TO service_role;

ALTER TABLE public.market_podium_ordering_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view ordering overrides"
  ON public.market_podium_ordering_overrides
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage ordering overrides"
  ON public.market_podium_ordering_overrides
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_update_podium_ordering_overrides_updated_at
  BEFORE UPDATE ON public.market_podium_ordering_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Per-entry stake cap (1000 tokens) for any PODIUM market
CREATE OR REPLACE FUNCTION public.enforce_podium_single_stake_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_market_type text;
BEGIN
  IF NEW.market_id IS NULL OR NEW.total_stake_tokens IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT market_type INTO v_market_type
  FROM public.markets
  WHERE id = NEW.market_id;

  IF v_market_type = 'PODIUM' AND NEW.total_stake_tokens > 1000 THEN
    RAISE EXCEPTION 'entry_not_allowed'
      USING ERRCODE = 'P0001',
            HINT = format('podium_stake_cap stake=%s cap=1000', NEW.total_stake_tokens);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_podium_stake_cap
  BEFORE INSERT ON public.bet_slips
  FOR EACH ROW EXECUTE FUNCTION public.enforce_podium_single_stake_cap();

-- 3. Create 4 PODIUM markets on Royal Nautique Pro and clone selections from WINNER markets
DO $$
DECLARE
  v_tid uuid := 'dad9b595-fa2b-4fbb-a174-1a57efe7951a';
  rec   RECORD;
  v_new_market_id uuid;
BEGIN
  FOR rec IN
    SELECT id AS winner_id, discipline, category
    FROM public.markets
    WHERE tournament_id = v_tid AND market_type = 'WINNER'
  LOOP
    -- Skip if PODIUM already exists for this (discipline, category)
    IF EXISTS (
      SELECT 1 FROM public.markets
      WHERE tournament_id = v_tid
        AND market_type   = 'PODIUM'
        AND discipline    = rec.discipline
        AND category      = rec.category
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.markets (tournament_id, discipline, category, market_type, name, is_published)
    VALUES (
      v_tid, rec.discipline, rec.category, 'PODIUM',
      CASE
        WHEN rec.category = 'open_men' AND rec.discipline = 'slalom' THEN 'Open Men Slalom — Podium'
        WHEN rec.category = 'open_men' AND rec.discipline = 'trick'  THEN 'Open Men Tricks — Podium'
        WHEN rec.category = 'open_women' AND rec.discipline = 'slalom' THEN 'Open Women Slalom — Podium'
        WHEN rec.category = 'open_women' AND rec.discipline = 'trick'  THEN 'Open Women Tricks — Podium'
        ELSE rec.category || ' ' || rec.discipline || ' Podium'
      END,
      false
    )
    RETURNING id INTO v_new_market_id;

    -- Clone selections (athlete pool + odds) from the matching WINNER market
    INSERT INTO public.selections (market_id, athlete_id, decimal_odds, description)
    SELECT v_new_market_id, athlete_id, decimal_odds, description
    FROM public.selections
    WHERE market_id = rec.winner_id;
  END LOOP;
END $$;

-- 4. Seed protected chalk-ordering overrides
DO $$
DECLARE
  v_tid uuid := 'dad9b595-fa2b-4fbb-a174-1a57efe7951a';
  v_men_slalom uuid;
  v_men_tricks uuid;
  v_wom_slalom uuid;
  v_wom_tricks uuid;
BEGIN
  SELECT id INTO v_men_slalom FROM public.markets WHERE tournament_id=v_tid AND market_type='PODIUM' AND discipline='slalom' AND category='open_men';
  SELECT id INTO v_men_tricks FROM public.markets WHERE tournament_id=v_tid AND market_type='PODIUM' AND discipline='trick'  AND category='open_men';
  SELECT id INTO v_wom_slalom FROM public.markets WHERE tournament_id=v_tid AND market_type='PODIUM' AND discipline='slalom' AND category='open_women';
  SELECT id INTO v_wom_tricks FROM public.markets WHERE tournament_id=v_tid AND market_type='PODIUM' AND discipline='trick'  AND category='open_women';

  INSERT INTO public.market_podium_ordering_overrides
    (market_id, first_athlete, second_athlete, third_athlete, manual_multiplier, is_protected, reason)
  VALUES
    -- Men slalom: Ross / Winter / McCormick → 7.0
    (v_men_slalom,
     '67a2f3c9-cb3f-4a56-af03-ca3f968c2570'::uuid,
     '6c170125-154a-41bd-9df2-d8010e5f3030'::uuid,
     '98b3938b-c6ec-4a21-a426-819b151d7370'::uuid,
     7.0, true, 'protected chalk ordering'),
    -- Men tricks: Gonzalez / Abelson / Font (Patricio) → 7.0
    (v_men_tricks,
     'e1bbb5bd-4577-4601-8b9d-b5b72a2b24f8'::uuid,
     'b1394574-d1e1-4c6b-8dd5-9f1246140514'::uuid,
     'b0cda6b2-40da-4f52-8cb8-5f2913350baa'::uuid,
     7.0, true, 'protected chalk ordering'),
    -- Women slalom: Bull / Nicholson / N.Ross → 6.0
    (v_wom_slalom,
     '5ea128d3-9eb2-41c1-899a-ea618f1d22f7'::uuid,
     '4d1d55d4-5385-40ee-9018-7a6de5808ee7'::uuid,
     '0a66bef9-8716-4053-ad48-7a67465dc6e9'::uuid,
     6.0, true, 'protected chalk ordering'),
    -- Women tricks: N.Ross / Hansen / Stopnicki → 1.8
    (v_wom_tricks,
     '0a66bef9-8716-4053-ad48-7a67465dc6e9'::uuid,
     '2d12d112-801d-4be7-9dc6-89b7b689f53e'::uuid,
     '3d4cff15-cd7c-413e-a746-3d3e9edfeb8b'::uuid,
     1.8, true, 'protected chalk ordering')
  ON CONFLICT (market_id, first_athlete, second_athlete, third_athlete) DO NOTHING;
END $$;
