
-- 1. market_multiplier_overrides: drop public read
DROP POLICY IF EXISTS "Public can read enabled overrides" ON public.market_multiplier_overrides;

-- 2. market_probability_overrides: drop public read
DROP POLICY IF EXISTS "Public can read enabled probability overrides" ON public.market_probability_overrides;

-- 3. token_transactions: drop user insert (server-only writes via service role / SECURITY DEFINER RPCs)
DROP POLICY IF EXISTS "Users can insert their own transactions" ON public.token_transactions;

-- 4. fantasy_roster_snapshots: drop overly broad service policy
DROP POLICY IF EXISTS "Service role can manage snapshots" ON public.fantasy_roster_snapshots;
-- Service role bypasses RLS automatically. Existing owner-SELECT and admin-SELECT policies remain.

-- 5. referral_codes: restrict to authenticated only; provide RPC for unauthenticated validation
DROP POLICY IF EXISTS "Anyone can read active referral codes" ON public.referral_codes;
CREATE POLICY "Authenticated can read active referral codes"
  ON public.referral_codes
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND (start_at IS NULL OR start_at <= now())
    AND (end_at IS NULL OR end_at > now())
  );

CREATE OR REPLACE FUNCTION public.validate_referral_code(p_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.referral_codes
    WHERE code = upper(trim(p_code))
      AND is_active = true
      AND (start_at IS NULL OR start_at <= now())
      AND (end_at IS NULL OR end_at > now())
      AND (max_uses_total IS NULL OR uses_count < max_uses_total)
  );
$$;
REVOKE ALL ON FUNCTION public.validate_referral_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_referral_code(text) TO anon, authenticated;

-- 6. system_events: replace broad authenticated policies with admin-only
DROP POLICY IF EXISTS "Service role can insert events" ON public.system_events;
DROP POLICY IF EXISTS "Service role can update events" ON public.system_events;
CREATE POLICY "Admins can insert events"
  ON public.system_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update events"
  ON public.system_events FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 7. Fix mutable search_path on validate_bet_slip_min_stake
CREATE OR REPLACE FUNCTION public.validate_bet_slip_min_stake()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.total_stake_tokens < 100 THEN
    RAISE EXCEPTION 'Minimum stake is 100 tokens, got %', NEW.total_stake_tokens;
  END IF;
  RETURN NEW;
END;
$function$;

-- 8. Revoke EXECUTE on internal/admin-only SECURITY DEFINER functions
DO $$
DECLARE
  fn text;
  trigger_or_admin_fns text[] := ARRAY[
    'validate_tournament_entry_rank_rating()',
    'enforce_bet_slip_immutability()',
    'ensure_first_admin()',
    'prevent_audit_log_modification()',
    'handle_new_user_email_preferences()',
    'schedule_odds_on_rating_change()',
    'on_liability_status_change()',
    'update_updated_at_column()',
    'handle_new_user()',
    'block_banned_words_on_publish()',
    'enforce_market_publish_gate()',
    'tournament_results_auto_flags()',
    'enforce_event_handle_cap()',
    'cascade_slip_cancel_to_predictions()',
    'cleanup_liability_on_settlement()',
    'update_market_liability()',
    'schedule_odds_on_entry_change()',
    'validate_bet_slip_min_stake()',
    'on_redemption_created()',
    'audit_bet_slip_changes()',
    'refund_redemption(uuid, text)',
    'reverse_settlement(uuid, uuid, text, uuid)',
    'rebuild_market_liability()',
    'notify_admins_redemption_new(uuid, text, integer)',
    'increment_earned_tokens(uuid, integer)',
    'emit_event(text, uuid, jsonb)'
  ];
BEGIN
  FOREACH fn IN ARRAY trigger_or_admin_fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;

-- 9. Realtime: require authentication for all channel subscriptions
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can receive realtime" ON realtime.messages;
CREATE POLICY "Authenticated users can receive realtime"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (true);
