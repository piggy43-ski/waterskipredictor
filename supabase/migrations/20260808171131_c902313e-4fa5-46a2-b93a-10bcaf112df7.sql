-- ===== ENUMS =====
CREATE TYPE public.vault_drop_status AS ENUM ('scheduled','live','closed');
CREATE TYPE public.vault_condition AS ENUM ('brand_new','barely_ridden','ridden');
CREATE TYPE public.vault_listing_type AS ENUM ('auction','buy_now');
CREATE TYPE public.vault_ski_status AS ENUM ('scheduled','live','ended_met','ended_no_reserve_met','sold','cancelled');
CREATE TYPE public.vault_order_status AS ENUM ('pending_charge','paid','failed','refunded','shipped','cancelled');

-- ===== DROPS =====
CREATE TABLE public.vault_drops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  drop_number int NOT NULL,
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  status public.vault_drop_status NOT NULL DEFAULT 'scheduled',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vault_drops TO anon, authenticated;
GRANT ALL ON public.vault_drops TO service_role;
ALTER TABLE public.vault_drops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vault_drops public read" ON public.vault_drops FOR SELECT USING (true);
CREATE POLICY "vault_drops admin write" ON public.vault_drops FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ===== SKIS =====
CREATE TABLE public.vault_skis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id uuid REFERENCES public.vault_drops(id) ON DELETE SET NULL,
  brand text NOT NULL,
  model text NOT NULL,
  size_cm text,
  year text,
  condition public.vault_condition NOT NULL DEFAULT 'ridden',
  title text NOT NULL,
  description text,
  image_urls text[] NOT NULL DEFAULT '{}',
  listing_type public.vault_listing_type NOT NULL DEFAULT 'auction',
  start_price numeric NOT NULL DEFAULT 0,
  reserve_price numeric,
  buy_now_price numeric,
  current_price numeric NOT NULL DEFAULT 0,
  bid_count int NOT NULL DEFAULT 0,
  highest_bidder_id uuid,
  closes_at timestamptz,
  status public.vault_ski_status NOT NULL DEFAULT 'scheduled',
  retail_price numeric,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- column-level grants: reserve_price is NEVER granted to anon/authenticated
GRANT SELECT (id, drop_id, brand, model, size_cm, year, condition, title, description,
  image_urls, listing_type, start_price, buy_now_price, current_price, bid_count,
  highest_bidder_id, closes_at, status, retail_price, sort_order, created_at, updated_at)
  ON public.vault_skis TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vault_skis TO authenticated;
GRANT ALL ON public.vault_skis TO service_role;
ALTER TABLE public.vault_skis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vault_skis public read" ON public.vault_skis FOR SELECT USING (true);
CREATE POLICY "vault_skis admin write" ON public.vault_skis FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_vault_skis_drop ON public.vault_skis(drop_id);
CREATE INDEX idx_vault_skis_status ON public.vault_skis(status);

-- ===== BIDS =====
CREATE TABLE public.vault_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ski_id uuid NOT NULL REFERENCES public.vault_skis(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  max_bid numeric NOT NULL,
  amount numeric NOT NULL,
  is_auto boolean NOT NULL DEFAULT false,
  outbid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vault_bids TO anon, authenticated;
GRANT ALL ON public.vault_bids TO service_role;
ALTER TABLE public.vault_bids ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vault_bids public read" ON public.vault_bids FOR SELECT USING (true);
CREATE INDEX idx_vault_bids_ski ON public.vault_bids(ski_id, created_at DESC);
CREATE INDEX idx_vault_bids_user ON public.vault_bids(user_id);

-- ===== BIDDER PROFILES =====
CREATE TABLE public.vault_bidder_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text NOT NULL DEFAULT 'US',
  shipping_zone int,
  local_pickup boolean NOT NULL DEFAULT false,
  stripe_customer_id text,
  stripe_payment_method_id text,
  payment_method_last4 text,
  payment_method_brand text,
  is_verified boolean NOT NULL DEFAULT false,
  bidding_terms_accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.vault_bidder_profiles TO authenticated;
GRANT ALL ON public.vault_bidder_profiles TO service_role;
ALTER TABLE public.vault_bidder_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vault_profiles own read" ON public.vault_bidder_profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "vault_profiles own insert" ON public.vault_bidder_profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vault_profiles own update" ON public.vault_bidder_profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ===== ORDERS =====
CREATE TABLE public.vault_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ski_id uuid NOT NULL REFERENCES public.vault_skis(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  hammer_price numeric NOT NULL,
  shipping_cost numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL,
  stripe_payment_intent_id text,
  status public.vault_order_status NOT NULL DEFAULT 'pending_charge',
  tracking_number text,
  charge_attempts int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  shipped_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vault_orders TO authenticated;
GRANT INSERT, UPDATE ON public.vault_orders TO authenticated;
GRANT ALL ON public.vault_orders TO service_role;
ALTER TABLE public.vault_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vault_orders own read" ON public.vault_orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "vault_orders admin write" ON public.vault_orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ===== WATCHLIST =====
CREATE TABLE public.vault_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ski_id uuid NOT NULL REFERENCES public.vault_skis(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ski_id)
);
GRANT SELECT, INSERT, DELETE ON public.vault_watchlist TO authenticated;
GRANT ALL ON public.vault_watchlist TO service_role;
ALTER TABLE public.vault_watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vault_watchlist own all" ON public.vault_watchlist FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ===== SHIPPING ZONES =====
CREATE TABLE public.vault_shipping_zones (
  zone int PRIMARY KEY,
  states text[] NOT NULL DEFAULT '{}',
  price numeric NOT NULL,
  label text
);
GRANT SELECT ON public.vault_shipping_zones TO anon, authenticated;
GRANT ALL ON public.vault_shipping_zones TO service_role;
ALTER TABLE public.vault_shipping_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vault_zones public read" ON public.vault_shipping_zones FOR SELECT USING (true);
CREATE POLICY "vault_zones admin write" ON public.vault_shipping_zones FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.vault_shipping_zones (zone, states, price, label) VALUES
  (1, ARRAY['FL','GA','AL','SC'], 55, 'Zone 1'),
  (2, ARRAY['NC','TN','MS','LA','VA','KY','AR','WV','MD','DE','DC'], 65, 'Zone 2'),
  (3, ARRAY['TX','OK','MO','IL','IN','OH','PA','NJ','NY','CT','RI','MA','NH','VT','ME','MI','WI','IA','KS','MN','NE','SD','ND'], 79, 'Zone 3'),
  (4, ARRAY['CA','OR','WA','NV','AZ','UT','ID','MT','WY','CO','NM'], 95, 'Zone 4'),
  (5, ARRAY[]::text[], 0, 'Local pickup — Winter Garden, FL');

-- ===== HELPERS =====
CREATE OR REPLACE FUNCTION public.vault_bid_increment(p_price numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_price < 100 THEN 5
    WHEN p_price < 300 THEN 10
    WHEN p_price < 700 THEN 25
    WHEN p_price < 1500 THEN 50
    ELSE 100 END::numeric;
$$;

CREATE OR REPLACE FUNCTION public.vault_reserve_met(p_ski_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(s.reserve_price IS NULL OR s.current_price >= s.reserve_price, false)
  FROM public.vault_skis s WHERE s.id = p_ski_id;
$$;

CREATE OR REPLACE FUNCTION public.vault_server_time()
RETURNS timestamptz LANGUAGE sql STABLE AS $$ SELECT now(); $$;

CREATE OR REPLACE FUNCTION public.vault_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_vault_drops_touch BEFORE UPDATE ON public.vault_drops
  FOR EACH ROW EXECUTE FUNCTION public.vault_touch_updated_at();
CREATE TRIGGER trg_vault_skis_touch BEFORE UPDATE ON public.vault_skis
  FOR EACH ROW EXECUTE FUNCTION public.vault_touch_updated_at();
CREATE TRIGGER trg_vault_profiles_touch BEFORE UPDATE ON public.vault_bidder_profiles
  FOR EACH ROW EXECUTE FUNCTION public.vault_touch_updated_at();
CREATE TRIGGER trg_vault_orders_touch BEFORE UPDATE ON public.vault_orders
  FOR EACH ROW EXECUTE FUNCTION public.vault_touch_updated_at();

-- bids are append-only
CREATE OR REPLACE FUNCTION public.vault_bids_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'vault_bids is append-only'; END; $$;
CREATE TRIGGER trg_vault_bids_no_delete BEFORE DELETE ON public.vault_bids
  FOR EACH ROW EXECUTE FUNCTION public.vault_bids_append_only();

-- ===== PUBLIC VIEW (no reserve_price) =====
CREATE VIEW public.vault_public_skis
WITH (security_invoker = true) AS
SELECT s.id, s.drop_id, s.brand, s.model, s.size_cm, s.year, s.condition, s.title,
  s.description, s.image_urls, s.listing_type, s.start_price, s.buy_now_price,
  s.current_price, s.bid_count, s.highest_bidder_id, s.closes_at, s.status,
  s.retail_price, s.sort_order, s.created_at, s.updated_at,
  public.vault_reserve_met(s.id) AS reserve_met
FROM public.vault_skis s;
GRANT SELECT ON public.vault_public_skis TO anon, authenticated;

-- ===== MASKED BID HISTORY =====
CREATE OR REPLACE FUNCTION public.vault_bid_history(p_ski_id uuid)
RETURNS TABLE(id uuid, handle text, amount numeric, is_auto boolean, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id,
    COALESCE(
      CASE WHEN p.username IS NULL OR length(p.username) < 3 THEN NULL
        ELSE left(p.username,2) || '***' || right(p.username,1) END,
      'bidder***' || right(b.user_id::text,2)
    ) AS handle,
    b.amount, b.is_auto, b.created_at
  FROM public.vault_bids b
  LEFT JOIN public.profiles p ON p.id = b.user_id
  WHERE b.ski_id = p_ski_id
  ORDER BY b.created_at DESC;
$$;

-- ===== PROXY BIDDING ENGINE =====
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
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sign in to bid'; END IF;
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

  UPDATE public.vault_skis
     SET current_price = v_new_price,
         bid_count = bid_count + 1,
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

REVOKE ALL ON FUNCTION public.vault_place_bid(uuid, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.vault_place_bid(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vault_bid_history(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_reserve_met(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_server_time() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_bid_increment(numeric) TO anon, authenticated;

-- ===== REALTIME =====
ALTER TABLE public.vault_skis REPLICA IDENTITY FULL;
ALTER TABLE public.vault_bids REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vault_skis;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vault_bids;