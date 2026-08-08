
-- 1) SKIS: specs_confirmed + sku uniqueness + auto SKU
ALTER TABLE public.vault_skis
  ADD COLUMN IF NOT EXISTS specs_confirmed boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS vault_skis_sku_key ON public.vault_skis (sku) WHERE sku IS NOT NULL;

CREATE OR REPLACE FUNCTION public.vault_next_sku()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'V-' || lpad((
    COALESCE(MAX((substring(sku from '^V-(\d+)$'))::int), 0) + 1
  )::text, 3, '0')
  FROM public.vault_skis
  WHERE sku ~ '^V-\d+$'
$$;

CREATE OR REPLACE FUNCTION public.vault_skis_assign_sku()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sku IS NULL OR btrim(NEW.sku) = '' THEN
    NEW.sku := public.vault_next_sku();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vault_skis_assign_sku_trg ON public.vault_skis;
CREATE TRIGGER vault_skis_assign_sku_trg
BEFORE INSERT ON public.vault_skis
FOR EACH ROW EXECUTE FUNCTION public.vault_skis_assign_sku();

CREATE OR REPLACE FUNCTION public.vault_skis_require_specs_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'live' AND COALESCE(NEW.specs_confirmed, false) = false THEN
    RAISE EXCEPTION 'Specs must be confirmed before a lot can go live';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vault_skis_require_specs_confirmed_trg ON public.vault_skis;
CREATE TRIGGER vault_skis_require_specs_confirmed_trg
BEFORE INSERT OR UPDATE OF status, specs_confirmed ON public.vault_skis
FOR EACH ROW EXECUTE FUNCTION public.vault_skis_require_specs_confirmed();

-- 2) CONSIGNORS
CREATE TABLE IF NOT EXISTS public.vault_consignors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  real_name text,
  email text,
  phone text,
  user_id uuid,
  is_anonymous boolean NOT NULL DEFAULT true,
  commission_rate numeric NOT NULL DEFAULT 0.25,
  payout_method text,
  payout_details text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vault_consignors TO authenticated;
GRANT ALL ON public.vault_consignors TO service_role;
ALTER TABLE public.vault_consignors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage consignors" ON public.vault_consignors;
CREATE POLICY "Admins manage consignors" ON public.vault_consignors
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS vault_consignors_touch ON public.vault_consignors;
CREATE TRIGGER vault_consignors_touch BEFORE UPDATE ON public.vault_consignors
FOR EACH ROW EXECUTE FUNCTION public.vault_touch_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vault_skis_consignor_id_fkey'
  ) THEN
    ALTER TABLE public.vault_skis
      ADD CONSTRAINT vault_skis_consignor_id_fkey
      FOREIGN KEY (consignor_id) REFERENCES public.vault_consignors(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3) ORDERS: consignment accounting (from hammer price only)
ALTER TABLE public.vault_orders
  ADD COLUMN IF NOT EXISTS consignor_id uuid REFERENCES public.vault_consignors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commission_rate numeric,
  ADD COLUMN IF NOT EXISTS house_cut numeric,
  ADD COLUMN IF NOT EXISTS consignor_payout numeric;

CREATE OR REPLACE FUNCTION public.vault_orders_apply_consignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consignor uuid;
  v_rate numeric;
BEGIN
  SELECT s.consignor_id INTO v_consignor FROM public.vault_skis s WHERE s.id = NEW.ski_id;
  IF v_consignor IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT c.commission_rate INTO v_rate FROM public.vault_consignors c WHERE c.id = v_consignor;
  v_rate := COALESCE(NEW.commission_rate, v_rate, 0.25);
  NEW.consignor_id := v_consignor;
  NEW.commission_rate := v_rate;
  -- shipping is a pass-through cost and is never commissionable
  NEW.house_cut := round(COALESCE(NEW.hammer_price, 0) * v_rate, 2);
  NEW.consignor_payout := round(COALESCE(NEW.hammer_price, 0) - (COALESCE(NEW.hammer_price, 0) * v_rate), 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vault_orders_apply_consignment_trg ON public.vault_orders;
CREATE TRIGGER vault_orders_apply_consignment_trg
BEFORE INSERT ON public.vault_orders
FOR EACH ROW EXECUTE FUNCTION public.vault_orders_apply_consignment();

-- 4) PAYOUT LEDGER
CREATE TABLE IF NOT EXISTS public.vault_consignor_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consignor_id uuid NOT NULL REFERENCES public.vault_consignors(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  method text,
  reference text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vault_consignor_payouts TO authenticated;
GRANT ALL ON public.vault_consignor_payouts TO service_role;
ALTER TABLE public.vault_consignor_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage consignor payouts" ON public.vault_consignor_payouts;
CREATE POLICY "Admins manage consignor payouts" ON public.vault_consignor_payouts
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5) PUBLIC INTAKE SUBMISSIONS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vault_submission_status') THEN
    CREATE TYPE public.vault_submission_status AS ENUM ('new','accepted','declined','received');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.vault_consignment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  model text NOT NULL,
  size_cm text,
  year text,
  condition public.vault_condition NOT NULL DEFAULT 'ridden',
  asking_price numeric,
  notes text,
  image_urls text[] NOT NULL DEFAULT '{}',
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  user_id uuid,
  status public.vault_submission_status NOT NULL DEFAULT 'new',
  admin_notes text,
  consignor_id uuid REFERENCES public.vault_consignors(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.vault_consignment_submissions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vault_consignment_submissions TO authenticated;
GRANT ALL ON public.vault_consignment_submissions TO service_role;
ALTER TABLE public.vault_consignment_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can submit gear" ON public.vault_consignment_submissions;
CREATE POLICY "Anyone can submit gear" ON public.vault_consignment_submissions
FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Admins read submissions" ON public.vault_consignment_submissions;
CREATE POLICY "Admins read submissions" ON public.vault_consignment_submissions
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update submissions" ON public.vault_consignment_submissions;
CREATE POLICY "Admins update submissions" ON public.vault_consignment_submissions
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete submissions" ON public.vault_consignment_submissions;
CREATE POLICY "Admins delete submissions" ON public.vault_consignment_submissions
FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS vault_submissions_touch ON public.vault_consignment_submissions;
CREATE TRIGGER vault_submissions_touch BEFORE UPDATE ON public.vault_consignment_submissions
FOR EACH ROW EXECUTE FUNCTION public.vault_touch_updated_at();

-- 6) PUBLIC VIEW: add sku + specs_confirmed, never reserve_price or consignor_id
DROP VIEW IF EXISTS public.vault_public_skis;
CREATE VIEW public.vault_public_skis WITH (security_barrier = true) AS
SELECT
  s.id,
  s.drop_id,
  s.sku,
  s.specs_confirmed,
  s.brand,
  s.model,
  s.size_cm,
  s.year,
  s.condition,
  s.title,
  s.description,
  s.image_urls,
  s.listing_type,
  s.start_price,
  s.buy_now_price,
  s.current_price,
  s.bid_count,
  s.highest_bidder_id,
  s.closes_at,
  s.status,
  s.retail_price,
  s.sort_order,
  s.created_at,
  s.updated_at,
  (s.reserve_price IS NULL OR s.current_price >= s.reserve_price) AS reserve_met,
  (s.reserve_price IS NOT NULL) AS has_reserve,
  (s.consignor_id IS NOT NULL) AS is_consigned
FROM public.vault_skis s;

GRANT SELECT ON public.vault_public_skis TO anon, authenticated;
