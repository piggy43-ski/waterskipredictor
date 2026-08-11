
-- 1. Ungate the public lot view (reserve still withheld, cancelled still excluded)
CREATE OR REPLACE VIEW public.vault_public_skis AS
WITH base AS (
  SELECT s.*, d.teaser_at, d.opens_at AS drop_opens_at, d.closes_at AS drop_closes_at,
         c.slug AS c_slug,
         CASE
           WHEN s.status IN ('live','ended_met','ended_no_reserve_met','sold')
             OR (d.opens_at IS NOT NULL AND now() >= d.opens_at) THEN 'revealed'
           WHEN d.teaser_at IS NOT NULL AND now() >= d.teaser_at THEN 'teaser'
           ELSE 'hidden'
         END AS reveal_state
  FROM public.vault_skis s
  LEFT JOIN public.vault_drops d ON d.id = s.drop_id
  LEFT JOIN public.vault_consignors c ON c.id = s.consignor_id
  WHERE s.status <> 'cancelled'::vault_ski_status
)
SELECT id, drop_id, lot_number, reveal_state, teaser_at, drop_opens_at, drop_closes_at,
  teaser_headline, teaser_clues, sku, specs_confirmed, brand, model, size_cm, year, condition,
  title, description, provenance, market_price, market_source, image_urls, listing_type,
  start_price, buy_now_price, current_price, bid_count, highest_bidder_id,
  COALESCE(closes_at, drop_closes_at) AS closes_at,
  status, retail_price, sort_order, created_at, updated_at,
  (reserve_price IS NULL OR current_price >= reserve_price) AS reserve_met,
  (reserve_price IS NOT NULL) AS has_reserve,
  (consignor_id IS NOT NULL) AS is_consigned,
  c_slug AS consignor_slug
FROM base b;

-- 2. Milestones
CREATE TABLE IF NOT EXISTS public.vault_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ski_id uuid NOT NULL REFERENCES public.vault_skis(id) ON DELETE CASCADE,
  threshold numeric NOT NULL CHECK (threshold > 0),
  label text NOT NULL,
  unlocked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ski_id, threshold)
);
GRANT SELECT ON public.vault_milestones TO anon, authenticated;
GRANT ALL ON public.vault_milestones TO service_role;
ALTER TABLE public.vault_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "milestones public read" ON public.vault_milestones FOR SELECT USING (true);
CREATE POLICY "milestones admin write" ON public.vault_milestones FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.vault_unlock_milestones()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.vault_milestones
     SET unlocked_at = now()
   WHERE ski_id = NEW.id AND unlocked_at IS NULL AND threshold <= NEW.current_price;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS vault_skis_unlock_milestones ON public.vault_skis;
CREATE TRIGGER vault_skis_unlock_milestones
AFTER UPDATE OF current_price ON public.vault_skis
FOR EACH ROW WHEN (NEW.current_price IS DISTINCT FROM OLD.current_price)
EXECUTE FUNCTION public.vault_unlock_milestones();

INSERT INTO public.vault_milestones (ski_id, threshold, label)
SELECT s.id, v.threshold, v.label
FROM public.vault_skis s
CROSS JOIN (VALUES
  (300::numeric, 'Free shipping, continental US'),
  (500::numeric, 'Rear toe plate included'),
  (700::numeric, 'Full fin setup sheet — the numbers it was actually ridden at')
) AS v(threshold, label)
WHERE s.sku = 'V-010'
ON CONFLICT (ski_id, threshold) DO NOTHING;

-- 3. Guess the hammer price (free; never touches money or token balances)
CREATE TABLE IF NOT EXISTS public.vault_price_guesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ski_id uuid NOT NULL REFERENCES public.vault_skis(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guess numeric NOT NULL CHECK (guess > 0 AND guess <= 100000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ski_id, user_id)
);
COMMENT ON TABLE public.vault_price_guesses IS
  'Free guess game. No stake, no fee, no currency column by design. Prizes pay out only in WSP tokens; auction money never converts to tokens and tokens are never spendable on lots.';
GRANT SELECT, INSERT ON public.vault_price_guesses TO authenticated;
GRANT ALL ON public.vault_price_guesses TO service_role;
ALTER TABLE public.vault_price_guesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guess read own" ON public.vault_price_guesses FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "guess insert own before final hour" ON public.vault_price_guesses FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.vault_skis s
      LEFT JOIN public.vault_drops d ON d.id = s.drop_id
      WHERE s.id = ski_id
        AND s.status <> 'cancelled'::vault_ski_status
        AND now() < COALESCE(s.closes_at, d.closes_at) - interval '1 hour'
    )
  );

CREATE OR REPLACE FUNCTION public.vault_guess_count(p_ski_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.vault_price_guesses WHERE ski_id = p_ski_id;
$$;
GRANT EXECUTE ON FUNCTION public.vault_guess_count(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.vault_guess_results(p_ski_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_final numeric; v_closed boolean; v_res jsonb;
BEGIN
  SELECT s.current_price,
         (s.status IN ('sold','ended_met','ended_no_reserve_met')
           OR COALESCE(s.closes_at, d.closes_at) <= now())
    INTO v_final, v_closed
  FROM public.vault_skis s LEFT JOIN public.vault_drops d ON d.id = s.drop_id
  WHERE s.id = p_ski_id;
  IF NOT COALESCE(v_closed,false) THEN
    RETURN jsonb_build_object('closed', false, 'total', public.vault_guess_count(p_ski_id));
  END IF;
  SELECT jsonb_build_object(
    'closed', true,
    'final_price', v_final,
    'total', (SELECT count(*) FROM public.vault_price_guesses WHERE ski_id = p_ski_id),
    'guesses', COALESCE((SELECT jsonb_agg(g.guess ORDER BY g.guess)
                         FROM public.vault_price_guesses g WHERE g.ski_id = p_ski_id), '[]'::jsonb),
    'winner', (
      SELECT jsonb_build_object(
        'handle', COALESCE(CASE WHEN length(p.username) >= 3
                    THEN left(p.username,2)||'***'||right(p.username,1) END,
                  'player***'||right(g.user_id::text,2)),
        'guess', g.guess)
      FROM public.vault_price_guesses g
      LEFT JOIN public.profiles p ON p.id = g.user_id
      WHERE g.ski_id = p_ski_id
      ORDER BY abs(g.guess - v_final), g.created_at
      LIMIT 1)
  ) INTO v_res;
  RETURN v_res;
END; $$;
GRANT EXECUTE ON FUNCTION public.vault_guess_results(uuid) TO anon, authenticated;

-- 4. Badges
CREATE TABLE IF NOT EXISTS public.vault_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ski_id uuid REFERENCES public.vault_skis(id) ON DELETE CASCADE,
  badge text NOT NULL CHECK (badge IN ('first_bidder','held_lead_longest','sniped','winner')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ski_id, badge)
);
GRANT SELECT ON public.vault_badges TO anon, authenticated;
GRANT ALL ON public.vault_badges TO service_role;
ALTER TABLE public.vault_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "badges public read" ON public.vault_badges FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.vault_award_first_bidder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.vault_bids WHERE ski_id = NEW.ski_id AND id <> NEW.id) THEN
    INSERT INTO public.vault_badges (user_id, ski_id, badge)
    VALUES (NEW.user_id, NEW.ski_id, 'first_bidder') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS vault_bids_first_bidder ON public.vault_bids;
CREATE TRIGGER vault_bids_first_bidder AFTER INSERT ON public.vault_bids
FOR EACH ROW EXECUTE FUNCTION public.vault_award_first_bidder();

CREATE OR REPLACE FUNCTION public.vault_award_badges(p_ski_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int := 0; v_winner uuid; v_close timestamptz;
BEGIN
  SELECT s.highest_bidder_id, COALESCE(s.closes_at, d.closes_at)
    INTO v_winner, v_close
  FROM public.vault_skis s LEFT JOIN public.vault_drops d ON d.id = s.drop_id
  WHERE s.id = p_ski_id;
  IF v_close IS NULL OR v_close > now() THEN RETURN 0; END IF;

  IF v_winner IS NOT NULL THEN
    INSERT INTO public.vault_badges (user_id, ski_id, badge)
    VALUES (v_winner, p_ski_id, 'winner') ON CONFLICT DO NOTHING;
  END IF;

  -- held the lead longest
  INSERT INTO public.vault_badges (user_id, ski_id, badge)
  SELECT user_id, p_ski_id, 'held_lead_longest' FROM (
    SELECT b.user_id,
           sum(COALESCE(lead(b.created_at) OVER (ORDER BY b.created_at), v_close) - b.created_at) AS held
    FROM public.vault_bids b WHERE b.ski_id = p_ski_id
    GROUP BY b.user_id, b.created_at
  ) x GROUP BY user_id ORDER BY sum(held) DESC LIMIT 1
  ON CONFLICT DO NOTHING;

  -- sniped: led inside the final minute, then lost
  INSERT INTO public.vault_badges (user_id, ski_id, badge)
  SELECT DISTINCT b.user_id, p_ski_id, 'sniped'
  FROM public.vault_bids b
  WHERE b.ski_id = p_ski_id
    AND b.created_at >= v_close - interval '1 minute'
    AND b.user_id IS DISTINCT FROM v_winner
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;
GRANT EXECUTE ON FUNCTION public.vault_award_badges(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.vault_lot_badges(p_ski_id uuid)
RETURNS TABLE(handle text, badge text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(CASE WHEN length(p.username) >= 3
            THEN left(p.username,2)||'***'||right(p.username,1) END,
          'bidder***'||right(v.user_id::text,2)) AS handle,
         v.badge
  FROM public.vault_badges v
  LEFT JOIN public.profiles p ON p.id = v.user_id
  WHERE v.ski_id = p_ski_id;
$$;
GRANT EXECUTE ON FUNCTION public.vault_lot_badges(uuid) TO anon, authenticated;
