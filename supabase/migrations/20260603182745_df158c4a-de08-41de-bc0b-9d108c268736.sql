
-- 1) SECURITY DEFINER RPC for safe redemption creation. Validates inputs and
-- only writes permitted fields. tracking_number, fulfillment_status, etc.
-- are NEVER user-controlled.
CREATE OR REPLACE FUNCTION public.create_redemption(
  p_reward_id uuid,
  p_glove_size text DEFAULT NULL,
  p_shipping_name text DEFAULT NULL,
  p_shipping_address_line1 text DEFAULT NULL,
  p_shipping_address_line2 text DEFAULT NULL,
  p_shipping_city text DEFAULT NULL,
  p_shipping_state text DEFAULT NULL,
  p_shipping_zip text DEFAULT NULL,
  p_shipping_phone text DEFAULT NULL,
  p_gift_card_email text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_reward record;
  v_fulfillment_status text;
  v_count integer;
  v_redemption_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT id, category, required_tokens, max_per_user, max_total, is_active
    INTO v_reward
    FROM public.rewards
   WHERE id = p_reward_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reward not found';
  END IF;

  IF COALESCE(v_reward.is_active, true) = false THEN
    RAISE EXCEPTION 'Reward is not available';
  END IF;

  -- Per-user limit (ignores cancelled rows)
  IF v_reward.max_per_user IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
      FROM public.redemptions
     WHERE user_id = v_user
       AND reward_id = p_reward_id
       AND status <> 'cancelled';
    IF v_count >= v_reward.max_per_user THEN
      RAISE EXCEPTION 'Per-user redemption limit reached';
    END IF;
  END IF;

  -- Total cap
  IF v_reward.max_total IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
      FROM public.redemptions
     WHERE reward_id = p_reward_id
       AND status <> 'cancelled';
    IF v_count >= v_reward.max_total THEN
      RAISE EXCEPTION 'Reward is sold out';
    END IF;
  END IF;

  -- Length / format guards on PII
  IF p_shipping_name IS NOT NULL AND length(p_shipping_name) > 100 THEN
    RAISE EXCEPTION 'shipping_name too long';
  END IF;
  IF p_shipping_address_line1 IS NOT NULL AND length(p_shipping_address_line1) > 200 THEN
    RAISE EXCEPTION 'shipping_address_line1 too long';
  END IF;
  IF p_shipping_address_line2 IS NOT NULL AND length(p_shipping_address_line2) > 200 THEN
    RAISE EXCEPTION 'shipping_address_line2 too long';
  END IF;
  IF p_shipping_city IS NOT NULL AND length(p_shipping_city) > 100 THEN
    RAISE EXCEPTION 'shipping_city too long';
  END IF;
  IF p_shipping_state IS NOT NULL AND length(p_shipping_state) > 2 THEN
    RAISE EXCEPTION 'shipping_state must be 2-letter code';
  END IF;
  IF p_shipping_zip IS NOT NULL AND p_shipping_zip !~ '^\d{5}$' THEN
    RAISE EXCEPTION 'shipping_zip must be 5 digits';
  END IF;
  IF p_shipping_phone IS NOT NULL AND length(p_shipping_phone) > 30 THEN
    RAISE EXCEPTION 'shipping_phone too long';
  END IF;
  IF p_gift_card_email IS NOT NULL AND (length(p_gift_card_email) > 255 OR p_gift_card_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
    RAISE EXCEPTION 'gift_card_email invalid';
  END IF;
  IF p_glove_size IS NOT NULL AND p_glove_size NOT IN ('XXS','XS','S','M','L','XL') THEN
    RAISE EXCEPTION 'glove_size invalid';
  END IF;

  v_fulfillment_status := CASE
    WHEN v_reward.category = 'elite_skis' THEN 'concierge_review'
    ELSE 'pending_fulfillment'
  END;

  INSERT INTO public.redemptions (
    user_id, reward_id, tokens_spent, status, fulfillment_status,
    glove_size,
    shipping_name, shipping_address_line1, shipping_address_line2,
    shipping_city, shipping_state, shipping_zip, shipping_phone,
    gift_card_email
  ) VALUES (
    v_user, p_reward_id, v_reward.required_tokens, 'pending', v_fulfillment_status,
    p_glove_size,
    p_shipping_name, p_shipping_address_line1, p_shipping_address_line2,
    p_shipping_city, p_shipping_state, p_shipping_zip, p_shipping_phone,
    p_gift_card_email
  )
  RETURNING id INTO v_redemption_id;

  RETURN v_redemption_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_redemption(
  uuid, text, text, text, text, text, text, text, text, text
) TO authenticated;

-- 2) Remove the user INSERT policy. Users can no longer write arbitrary
-- redemption rows; they must go through create_redemption().
DROP POLICY IF EXISTS "Users can create their own redemptions" ON public.redemptions;

-- 3) fantasy_roster_snapshots: make service-role-only intent explicit.
-- No INSERT/UPDATE/DELETE policies = RLS denies all authenticated writes
-- by default. Service role bypasses RLS. Add a comment to document.
COMMENT ON TABLE public.fantasy_roster_snapshots IS
  'Service-role-only writes. Inserts performed by snapshot-season-rosters edge function. No INSERT/UPDATE/DELETE policies exist, so authenticated clients are denied by RLS default-deny.';
