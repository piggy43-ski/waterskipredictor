
-- Lock down referral_codes: validation goes through validate_referral_code RPC
DROP POLICY IF EXISTS "Authenticated can read active referral codes" ON public.referral_codes;

-- Restrict public markets SELECT to published markets only.
-- Admins continue to see all rows via their admin SELECT path (has_role check via separate policy).
DROP POLICY IF EXISTS "Markets are viewable by everyone" ON public.markets;
CREATE POLICY "Published markets are viewable by everyone"
ON public.markets
FOR SELECT
USING (is_published = true OR has_role(auth.uid(), 'admin'::app_role));
