
ALTER TABLE public.rewards ADD COLUMN IF NOT EXISTS tier text;
ALTER TABLE public.rewards ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.rewards DROP CONSTRAINT IF EXISTS rewards_category_check;
ALTER TABLE public.rewards ADD CONSTRAINT rewards_category_check CHECK (category = ANY (ARRAY['coaching'::text, 'gear'::text, 'experience'::text, 'store_credit'::text, 'elite_skis'::text]));
ALTER TABLE public.rewards DROP CONSTRAINT IF EXISTS rewards_tier_check;
ALTER TABLE public.rewards ADD CONSTRAINT rewards_tier_check CHECK (tier IS NULL OR tier = ANY (ARRAY['ENTRY'::text, 'MID'::text, 'PRO'::text, 'ELITE'::text]));
