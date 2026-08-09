
-- 1. Time-gated public lot view
DROP VIEW IF EXISTS public.vault_public_skis;

CREATE VIEW public.vault_public_skis AS
WITH base AS (
  SELECT s.*,
         d.teaser_at,
         d.opens_at AS drop_opens_at,
         d.closes_at AS drop_closes_at,
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
SELECT
  b.id,
  b.drop_id,
  b.lot_number,
  b.reveal_state,
  b.teaser_at,
  b.drop_opens_at,
  b.drop_closes_at,
  CASE WHEN b.reveal_state <> 'hidden' THEN b.teaser_headline END AS teaser_headline,
  CASE WHEN b.reveal_state <> 'hidden' THEN b.teaser_clues END AS teaser_clues,
  CASE WHEN b.reveal_state = 'revealed' THEN b.sku END AS sku,
  CASE WHEN b.reveal_state = 'revealed' THEN b.specs_confirmed END AS specs_confirmed,
  CASE WHEN b.reveal_state = 'revealed' THEN b.brand END AS brand,
  CASE WHEN b.reveal_state = 'revealed' THEN b.model END AS model,
  CASE WHEN b.reveal_state = 'revealed' THEN b.size_cm END AS size_cm,
  CASE WHEN b.reveal_state = 'revealed' THEN b.year END AS year,
  CASE WHEN b.reveal_state = 'revealed' THEN b.condition END AS condition,
  CASE WHEN b.reveal_state = 'revealed' THEN b.title ELSE 'Lot ' || lpad(coalesce(b.lot_number, b.sort_order, 0)::text, 2, '0') END AS title,
  CASE WHEN b.reveal_state = 'revealed' THEN b.description END AS description,
  CASE WHEN b.reveal_state = 'revealed' THEN b.provenance END AS provenance,
  CASE WHEN b.reveal_state = 'revealed' THEN b.market_price END AS market_price,
  CASE WHEN b.reveal_state = 'revealed' THEN b.market_source END AS market_source,
  CASE WHEN b.reveal_state = 'revealed' THEN b.image_urls ELSE ARRAY[]::text[] END AS image_urls,
  CASE WHEN b.reveal_state = 'revealed' THEN b.listing_type END AS listing_type,
  CASE WHEN b.reveal_state = 'revealed' THEN b.start_price END AS start_price,
  CASE WHEN b.reveal_state = 'revealed' THEN b.buy_now_price END AS buy_now_price,
  CASE WHEN b.reveal_state = 'revealed' THEN b.current_price END AS current_price,
  CASE WHEN b.reveal_state = 'revealed' THEN b.bid_count ELSE 0 END AS bid_count,
  CASE WHEN b.reveal_state = 'revealed' THEN b.highest_bidder_id END AS highest_bidder_id,
  CASE WHEN b.reveal_state = 'revealed' THEN b.closes_at END AS closes_at,
  b.status,
  CASE WHEN b.reveal_state = 'revealed' THEN b.retail_price END AS retail_price,
  b.sort_order,
  b.created_at,
  b.updated_at,
  CASE WHEN b.reveal_state = 'revealed'
       THEN (b.reserve_price IS NULL OR b.current_price >= b.reserve_price) END AS reserve_met,
  CASE WHEN b.reveal_state = 'revealed' THEN b.reserve_price IS NOT NULL END AS has_reserve,
  CASE WHEN b.reveal_state = 'revealed' THEN b.consignor_id IS NOT NULL END AS is_consigned,
  CASE WHEN b.reveal_state = 'revealed' THEN b.c_slug END AS consignor_slug
FROM base b;

GRANT SELECT ON public.vault_public_skis TO anon, authenticated;

-- 2. Reminder list
CREATE TABLE IF NOT EXISTS public.vault_lot_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ski_id uuid NOT NULL REFERENCES public.vault_skis(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  notify_open boolean NOT NULL DEFAULT true,
  notify_closing boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS vault_lot_reminders_ski_email_idx
  ON public.vault_lot_reminders (ski_id, lower(email));

GRANT SELECT, INSERT ON public.vault_lot_reminders TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vault_lot_reminders TO authenticated;
GRANT ALL ON public.vault_lot_reminders TO service_role;

ALTER TABLE public.vault_lot_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can sign up for a lot reminder"
  ON public.vault_lot_reminders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Users can see their own reminders"
  ON public.vault_lot_reminders FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can remove their own reminders"
  ON public.vault_lot_reminders FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins manage reminders"
  ON public.vault_lot_reminders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Public waiting count (never exposes emails)
CREATE OR REPLACE FUNCTION public.vault_reminder_count(p_ski_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.vault_lot_reminders WHERE ski_id = p_ski_id;
$$;
GRANT EXECUTE ON FUNCTION public.vault_reminder_count(uuid) TO anon, authenticated;

-- 4. Manifest: aggregate teases, never names an unrevealed model
CREATE OR REPLACE FUNCTION public.vault_manifest()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    SELECT k.*, d.teaser_at, d.opens_at,
      (k.status IN ('live','ended_met','ended_no_reserve_met','sold')
        OR (d.opens_at IS NOT NULL AND now() >= d.opens_at)) AS revealed
    FROM public.vault_skis k
    LEFT JOIN public.vault_drops d ON d.id = k.drop_id
  ),
  pub AS (SELECT * FROM s WHERE status <> 'cancelled'::vault_ski_status)
  SELECT jsonb_build_object(
    'total_in_vault', (SELECT count(*) FROM s),
    'released', (SELECT count(*) FROM pub WHERE revealed),
    'sold', (SELECT count(*) FROM pub WHERE status = 'sold'),
    'teases', jsonb_build_object(
      'sixty_sevens', (SELECT count(*) FROM pub WHERE NOT revealed AND size_cm ILIKE '%67%'),
      'never_ridden', (SELECT count(*) FROM pub WHERE NOT revealed AND condition = 'brand_new'::vault_condition),
      'newest_year', (SELECT max(year) FROM pub WHERE NOT revealed),
      'no_reserve', (SELECT count(*) FROM pub WHERE NOT revealed AND reserve_price IS NULL)
    ),
    'lots', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', CASE WHEN revealed THEN id END,
        'lot_number', lot_number,
        'revealed', revealed,
        'status', status,
        'title', CASE WHEN revealed THEN title END,
        'image', CASE WHEN revealed THEN image_urls[1] END,
        'final_price', CASE WHEN revealed AND status IN ('sold','ended_met') THEN current_price END,
        'teaser_at', teaser_at,
        'opens_at', opens_at
      ) ORDER BY lot_number NULLS LAST), '[]'::jsonb)
      FROM pub
    )
  );
$$;
GRANT EXECUTE ON FUNCTION public.vault_manifest() TO anon, authenticated;
