
-- 1. audit_logs: restrict INSERT to service_role
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.audit_logs;
CREATE POLICY "Service role can insert audit logs"
ON public.audit_logs FOR INSERT TO service_role WITH CHECK (true);

-- 2. deposit_ledger: restrict INSERT to service_role
DROP POLICY IF EXISTS "Service role can insert deposits" ON public.deposit_ledger;
CREATE POLICY "Service role can insert deposits"
ON public.deposit_ledger FOR INSERT TO service_role WITH CHECK (true);

-- 3. email_logs
DROP POLICY IF EXISTS "Service role can insert email logs" ON public.email_logs;
CREATE POLICY "Service role can insert email logs"
ON public.email_logs FOR INSERT TO service_role WITH CHECK (true);

-- 4. email_subscriptions
DROP POLICY IF EXISTS "Service role can insert subscriptions" ON public.email_subscriptions;
CREATE POLICY "Service role can insert subscriptions"
ON public.email_subscriptions FOR INSERT TO service_role WITH CHECK (true);

-- 5. market_health_log
DROP POLICY IF EXISTS "Service role can insert market health log" ON public.market_health_log;
CREATE POLICY "Service role can insert market health log"
ON public.market_health_log FOR INSERT TO service_role WITH CHECK (true);

-- 6. risk_alerts
DROP POLICY IF EXISTS "Service role can insert risk alerts" ON public.risk_alerts;
CREATE POLICY "Service role can insert risk alerts"
ON public.risk_alerts FOR INSERT TO service_role WITH CHECK (true);

-- 7. token_wallets: drop user UPDATE policy; all mutations go through SECURITY DEFINER RPCs or service role
DROP POLICY IF EXISTS "Users can update their own wallet" ON public.token_wallets;

-- 8. referral_codes: admin-only SELECT (validity check is via validate_referral_code RPC)
DROP POLICY IF EXISTS "Authenticated users can read referral codes" ON public.referral_codes;
DROP POLICY IF EXISTS "Anyone can read active referral codes" ON public.referral_codes;
DROP POLICY IF EXISTS "Users can view referral codes" ON public.referral_codes;

-- 9. Remove market_multiplier_overrides from realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.market_multiplier_overrides;

-- 10. Realtime topic scoping: restrict to topics that include the user's uid
DROP POLICY IF EXISTS "Authenticated users can receive realtime" ON realtime.messages;
CREATE POLICY "Users can subscribe to own-scoped topics"
ON realtime.messages FOR SELECT TO authenticated
USING (
  realtime.topic() LIKE '%' || auth.uid()::text || '%'
  OR realtime.topic() LIKE 'public:%'
);
