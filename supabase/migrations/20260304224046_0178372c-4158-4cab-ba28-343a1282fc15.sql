-- Use a validation trigger instead of CHECK constraint (per guidelines)
CREATE OR REPLACE FUNCTION public.validate_bet_slip_min_stake()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.total_stake_tokens < 100 THEN
    RAISE EXCEPTION 'Minimum stake is 100 tokens, got %', NEW.total_stake_tokens;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_min_stake_on_bet_slips
  BEFORE INSERT OR UPDATE ON public.bet_slips
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_bet_slip_min_stake();