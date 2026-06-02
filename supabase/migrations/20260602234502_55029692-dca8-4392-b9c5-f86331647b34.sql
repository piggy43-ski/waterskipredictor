
-- 1. Protected flag on hand-tuned multiplier overrides
ALTER TABLE public.market_multiplier_overrides
  ADD COLUMN IF NOT EXISTS is_protected boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.market_multiplier_overrides.is_protected IS
  'When true, hand-tuned launch override — future engine rebuilds must not recompute over it.';

-- 2. Chalk concentration cap trigger on bet_slips
CREATE OR REPLACE FUNCTION public.enforce_chalk_concentration_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_multiplier numeric;
BEGIN
  IF NEW.market_id IS NULL OR NEW.athlete_id IS NULL OR NEW.total_stake_tokens IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(
    (SELECT manual_multiplier
       FROM public.market_multiplier_overrides
      WHERE market_id = NEW.market_id
        AND athlete_id = NEW.athlete_id
        AND is_enabled = true
      LIMIT 1),
    (SELECT final_decimal_odds
       FROM public.market_odds
      WHERE market_id = NEW.market_id
        AND athlete_id = NEW.athlete_id
      ORDER BY generated_at DESC NULLS LAST
      LIMIT 1)
  ) INTO v_multiplier;

  IF v_multiplier IS NOT NULL
     AND v_multiplier <= 1.5
     AND NEW.total_stake_tokens > 2500 THEN
    RAISE EXCEPTION 'entry_not_allowed'
      USING ERRCODE = 'P0001',
            HINT = format('multiplier=%s stake=%s', v_multiplier, NEW.total_stake_tokens);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_chalk_cap ON public.bet_slips;
CREATE TRIGGER enforce_chalk_cap
  BEFORE INSERT ON public.bet_slips
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_chalk_concentration_cap();
