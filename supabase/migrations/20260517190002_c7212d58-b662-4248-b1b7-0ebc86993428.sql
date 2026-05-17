-- Extend banned-word trigger to include "contest"/"contests"
CREATE OR REPLACE FUNCTION public.block_banned_words_on_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_word text;
  v_haystack text;
  v_tournament record;
  v_banned text[] := ARRAY[
    'bet','wager','odds','sportsbook','payout','cashout',
    'bookmaker','line','spread','gambling','contest','contests'
  ];
BEGIN
  IF NEW.is_published IS DISTINCT FROM true OR COALESCE(OLD.is_published, false) = true THEN
    RETURN NEW;
  END IF;

  SELECT name, location, COALESCE(notes,'') AS notes INTO v_tournament
  FROM tournaments WHERE id = NEW.tournament_id;

  v_haystack := lower(
    COALESCE(NEW.name,'') || ' ' ||
    COALESCE(v_tournament.name,'') || ' ' ||
    COALESCE(v_tournament.location,'') || ' ' ||
    COALESCE(v_tournament.notes,'')
  );

  FOREACH v_word IN ARRAY v_banned LOOP
    IF v_haystack ~ ('\m' || v_word || '\M') THEN
      RAISE EXCEPTION 'Cannot publish market: banned word "%" found in market or tournament copy. Rephrase using prediction-platform language.', v_word
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Publish-gate: markets cannot be published without a valid lock time after predictions open
CREATE OR REPLACE FUNCTION public.enforce_market_publish_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_open_at timestamptz;
BEGIN
  IF NEW.is_published IS DISTINCT FROM true OR COALESCE(OLD.is_published,false) = true THEN
    RETURN NEW;
  END IF;

  IF NEW.locked_at IS NULL THEN
    RAISE EXCEPTION 'Cannot publish market: locked_at is required.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT betting_open_time INTO v_open_at FROM tournaments WHERE id = NEW.tournament_id;

  IF v_open_at IS NOT NULL AND NEW.locked_at <= v_open_at THEN
    RAISE EXCEPTION 'Cannot publish market: locked_at (%) must be after the tournament predictions_open_at (%).', NEW.locked_at, v_open_at
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_markets_publish_gate ON public.markets;
CREATE TRIGGER trg_markets_publish_gate
BEFORE INSERT OR UPDATE OF is_published, locked_at ON public.markets
FOR EACH ROW
EXECUTE FUNCTION public.enforce_market_publish_gate();