
CREATE OR REPLACE FUNCTION public.block_banned_words_on_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_word text;
  v_haystack text;
  v_tournament record;
  v_banned text[] := ARRAY[
    'bet','wager','odds','sportsbook','payout','cashout',
    'bookmaker','line','spread','gambling'
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
$$;

DROP TRIGGER IF EXISTS trg_markets_block_banned_words ON public.markets;
CREATE TRIGGER trg_markets_block_banned_words
BEFORE INSERT OR UPDATE OF is_published ON public.markets
FOR EACH ROW
EXECUTE FUNCTION public.block_banned_words_on_publish();
