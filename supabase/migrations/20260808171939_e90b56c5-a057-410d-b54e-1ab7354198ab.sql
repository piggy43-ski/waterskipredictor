-- ── P0: lock the base table down completely ────────────────────────────────
DROP VIEW IF EXISTS public.vault_public_skis;

DROP POLICY IF EXISTS "vault_skis public read" ON public.vault_skis;

REVOKE ALL ON public.vault_skis FROM anon;
REVOKE ALL ON public.vault_skis FROM authenticated;
-- admins still need to create/edit lots; RLS restricts rows, and no SELECT is granted
GRANT INSERT, UPDATE, DELETE ON public.vault_skis TO authenticated;
GRANT ALL ON public.vault_skis TO service_role;

CREATE POLICY "vault_skis admin read" ON public.vault_skis FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Public view: runs as owner (definer) so it can read the base table, but the
-- reserve_price column is not projected and therefore cannot be reached.
CREATE VIEW public.vault_public_skis
WITH (security_barrier = true) AS
SELECT s.id, s.drop_id, s.brand, s.model, s.size_cm, s.year, s.condition, s.title,
       s.description, s.image_urls, s.listing_type, s.start_price, s.buy_now_price,
       s.current_price, s.bid_count, s.highest_bidder_id, s.closes_at, s.status,
       s.retail_price, s.sort_order, s.created_at, s.updated_at,
       (s.reserve_price IS NULL OR s.current_price >= s.reserve_price) AS reserve_met,
       (s.reserve_price IS NOT NULL) AS has_reserve
FROM public.vault_skis s;

GRANT SELECT ON public.vault_public_skis TO anon, authenticated;

-- Admin-only full read (includes reserve_price)
CREATE OR REPLACE FUNCTION public.vault_admin_skis(p_drop_id uuid DEFAULT NULL)
RETURNS SETOF public.vault_skis
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  RETURN QUERY
    SELECT * FROM public.vault_skis s
    WHERE p_drop_id IS NULL OR s.drop_id = p_drop_id
    ORDER BY s.sort_order, s.created_at;
END; $$;
REVOKE ALL ON FUNCTION public.vault_admin_skis(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vault_admin_skis(uuid) TO authenticated;

-- ── P0 cont: vault_bids must not expose raw user ids publicly ──────────────
DROP POLICY IF EXISTS "vault_bids public read" ON public.vault_bids;
REVOKE ALL ON public.vault_bids FROM anon;
REVOKE ALL ON public.vault_bids FROM authenticated;
GRANT SELECT ON public.vault_bids TO authenticated;
GRANT ALL ON public.vault_bids TO service_role;

CREATE POLICY "vault_bids own read" ON public.vault_bids FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ── P1 + P2 + verification gate: rebuild the bidding engine ────────────────
CREATE OR REPLACE FUNCTION public.vault_place_bid(p_ski_id uuid, p_max_bid numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_ski public.vault_skis%ROWTYPE;
  v_lead public.vault_bids%ROWTYPE;
  v_inc numeric;
  v_new_price numeric;
  v_leading boolean;
  v_extended boolean := false;
  v_verified boolean;
  v_count int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sign in to bid'; END IF;

  -- P1: the seller (any admin) may never bid on Vault lots.
  IF public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'Sellers cannot bid on their own lots';
  END IF;

  -- Payment method must be on file and verified before any bid is accepted.
  SELECT is_verified INTO v_verified FROM public.vault_bidder_profiles WHERE user_id = v_user;
  IF COALESCE(v_verified, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'PAYMENT_SETUP_REQUIRED';
  END IF;

  IF p_max_bid IS NULL OR p_max_bid <= 0 THEN RAISE EXCEPTION 'Invalid bid'; END IF;

  SELECT * INTO v_ski FROM public.vault_skis WHERE id = p_ski_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lot not found'; END IF;
  IF v_ski.listing_type <> 'auction' THEN RAISE EXCEPTION 'This lot is not an auction'; END IF;
  IF v_ski.status <> 'live' THEN RAISE EXCEPTION 'This lot is not accepting bids'; END IF;
  IF v_ski.closes_at IS NOT NULL AND v_ski.closes_at <= now() THEN RAISE EXCEPTION 'This lot has closed'; END IF;

  SELECT * INTO v_lead FROM public.vault_bids
   WHERE ski_id = p_ski_id ORDER BY max_bid DESC, created_at ASC LIMIT 1;

  IF v_lead.id IS NULL THEN
    IF p_max_bid < v_ski.start_price THEN
      RAISE EXCEPTION 'Minimum bid is %', v_ski.start_price;
    END IF;
    v_new_price := v_ski.start_price;
    INSERT INTO public.vault_bids(ski_id, user_id, max_bid, amount, is_auto)
      VALUES (p_ski_id, v_user, p_max_bid, v_new_price, false);
    v_leading := true;
  ELSE
    v_inc := public.vault_bid_increment(v_ski.current_price);
    IF p_max_bid < v_ski.current_price + v_inc AND v_lead.user_id <> v_user THEN
      RAISE EXCEPTION 'Minimum bid is %', v_ski.current_price + v_inc;
    END IF;

    IF v_lead.user_id = v_user THEN
      IF p_max_bid <= v_lead.max_bid THEN
        RAISE EXCEPTION 'Your maximum is already % or higher', v_lead.max_bid;
      END IF;
      v_new_price := v_ski.current_price;
      INSERT INTO public.vault_bids(ski_id, user_id, max_bid, amount, is_auto)
        VALUES (p_ski_id, v_user, p_max_bid, v_new_price, false);
      v_leading := true;
    ELSIF p_max_bid > v_lead.max_bid THEN
      v_new_price := LEAST(p_max_bid, v_lead.max_bid + public.vault_bid_increment(v_lead.max_bid));
      UPDATE public.vault_bids SET outbid_at = now()
        WHERE ski_id = p_ski_id AND user_id = v_lead.user_id AND outbid_at IS NULL;
      INSERT INTO public.vault_bids(ski_id, user_id, max_bid, amount, is_auto)
        VALUES (p_ski_id, v_user, p_max_bid, v_new_price, false);
      v_leading := true;
    ELSE
      v_new_price := LEAST(v_lead.max_bid, p_max_bid + public.vault_bid_increment(p_max_bid));
      INSERT INTO public.vault_bids(ski_id, user_id, max_bid, amount, is_auto, outbid_at)
        VALUES (p_ski_id, v_user, p_max_bid, p_max_bid, false, now());
      INSERT INTO public.vault_bids(ski_id, user_id, max_bid, amount, is_auto)
        VALUES (p_ski_id, v_lead.user_id, v_lead.max_bid, v_new_price, true);
      v_leading := false;
    END IF;
  END IF;

  IF v_ski.closes_at IS NOT NULL AND v_ski.closes_at - now() < interval '5 minutes' THEN
    v_extended := true;
  END IF;

  -- P2: derive bid_count so it can never drift
  SELECT count(*) INTO v_count FROM public.vault_bids
   WHERE ski_id = p_ski_id AND is_auto = false;

  UPDATE public.vault_skis
     SET current_price = v_new_price,
         bid_count = v_count,
         highest_bidder_id = CASE WHEN v_leading THEN v_user ELSE v_lead.user_id END,
         closes_at = CASE WHEN v_extended THEN now() + interval '5 minutes' ELSE closes_at END
   WHERE id = p_ski_id;

  RETURN jsonb_build_object(
    'success', true,
    'leading', v_leading,
    'current_price', v_new_price,
    'your_max', p_max_bid,
    'extended', v_extended,
    'reserve_met', public.vault_reserve_met(p_ski_id)
  );
END; $$;

-- ── Stripe support columns / idempotency ───────────────────────────────────
ALTER TABLE public.vault_orders
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS requires_action boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hosted_confirm_url text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_refund_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vault_orders_ski ON public.vault_orders(ski_id);

CREATE TABLE IF NOT EXISTS public.vault_processed_stripe_events (
  event_id text PRIMARY KEY,
  processed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.vault_processed_stripe_events TO service_role;
ALTER TABLE public.vault_processed_stripe_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vault stripe events service only" ON public.vault_processed_stripe_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);