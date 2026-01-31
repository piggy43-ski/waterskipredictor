-- RLS Hardening Migration
-- Addresses all policy gaps across 44 tables

-- ===========================================
-- 1. REWARDS - Add Admin Write Policies
-- ===========================================
CREATE POLICY "Admins can insert rewards"
ON public.rewards FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update rewards"
ON public.rewards FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete rewards"
ON public.rewards FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- ===========================================
-- 2. TOKEN_WALLETS - Add User INSERT Policy
-- ===========================================
CREATE POLICY "Users can insert their own wallet"
ON public.token_wallets FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- ===========================================
-- 3. REDEMPTIONS - Add Admin Access Policies
-- ===========================================
CREATE POLICY "Admins can view all redemptions"
ON public.redemptions FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update redemptions"
ON public.redemptions FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- ===========================================
-- 4. EMAIL_LOGS - Add Admin + Service Policies
-- ===========================================
CREATE POLICY "Admins can view email logs"
ON public.email_logs FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can insert email logs"
ON public.email_logs FOR INSERT
TO authenticated
WITH CHECK (true);

-- ===========================================
-- 5. SYSTEM_EVENTS - Add INSERT/UPDATE Policies
-- ===========================================
CREATE POLICY "Service role can insert events"
ON public.system_events FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Service role can update events"
ON public.system_events FOR UPDATE
TO authenticated
USING (true);

-- ===========================================
-- 6. RISK_CONFIG - Restrict to Admin-Only
-- ===========================================
DROP POLICY IF EXISTS "Everyone can read risk_config" ON public.risk_config;

CREATE POLICY "Admins can read risk_config"
ON public.risk_config FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- ===========================================
-- 7. MARKET_LIABILITY - Restrict to Admin-Only
-- ===========================================
DROP POLICY IF EXISTS "Authenticated users can read market_liability" ON public.market_liability;

-- ===========================================
-- 8. RATING_ADJUSTMENTS - Restrict to Admin-Only
-- ===========================================
DROP POLICY IF EXISTS "Rating adjustments viewable by everyone" ON public.rating_adjustments;

CREATE POLICY "Admins can view rating adjustments"
ON public.rating_adjustments FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- ===========================================
-- 9. RATING_HISTORY - Restrict to Admin-Only
-- ===========================================
DROP POLICY IF EXISTS "Rating history is viewable by everyone" ON public.rating_history;

CREATE POLICY "Admins can view rating history"
ON public.rating_history FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));