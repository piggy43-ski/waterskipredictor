-- 1) Consignor share links
ALTER TABLE public.vault_consignors
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS bio text;

UPDATE public.vault_consignors
   SET slug = regexp_replace(lower(trim(display_name)), '[^a-z0-9]+', '-', 'g')
 WHERE slug IS NULL AND display_name IS NOT NULL;

UPDATE public.vault_consignors SET slug = trim(both '-' from slug) WHERE slug IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vault_consignors_slug_key ON public.vault_consignors (slug);

-- 2) Referral attribution
ALTER TABLE public.vault_bids ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.vault_bidder_profiles ADD COLUMN IF NOT EXISTS source text;
CREATE INDEX IF NOT EXISTS vault_bids_source_idx ON public.vault_bids (source);

CREATE OR REPLACE FUNCTION public.vault_bids_set_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source IS NULL THEN
    SELECT p.source INTO NEW.source
      FROM public.vault_bidder_profiles p
     WHERE p.user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS vault_bids_source_trg ON public.vault_bids;
CREATE TRIGGER vault_bids_source_trg
BEFORE INSERT ON public.vault_bids
FOR EACH ROW EXECUTE FUNCTION public.vault_bids_set_source();

-- 3) Public skis view: provenance + market comp, no reserve, no cancelled lots
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
  s.provenance,
  s.market_price,
  s.market_source,
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
  (s.consignor_id IS NOT NULL) AS is_consigned,
  c.slug AS consignor_slug
FROM public.vault_skis s
LEFT JOIN public.vault_consignors c ON c.id = s.consignor_id
WHERE s.status <> 'cancelled';

GRANT SELECT ON public.vault_public_skis TO anon, authenticated;

-- 4) Public consignor view: alias, slug, bio only. Never real_name/email/phone/payout.
DROP VIEW IF EXISTS public.vault_public_consignors;
CREATE VIEW public.vault_public_consignors WITH (security_barrier = true) AS
SELECT c.id, c.slug, c.display_name, c.bio, c.is_anonymous
FROM public.vault_consignors c
WHERE c.slug IS NOT NULL;

GRANT SELECT ON public.vault_public_consignors TO anon, authenticated;