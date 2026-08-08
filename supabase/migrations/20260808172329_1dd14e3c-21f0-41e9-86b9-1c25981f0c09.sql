ALTER TABLE public.vault_bids ADD COLUMN IF NOT EXISTS outbid_notified_at timestamptz;

CREATE OR REPLACE FUNCTION public.vault_claim_buy_now(p_ski_id uuid, p_user_id uuid, p_shipping numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ski public.vault_skis%ROWTYPE;
  v_order_id uuid;
  v_price numeric;
BEGIN
  SELECT * INTO v_ski FROM public.vault_skis WHERE id = p_ski_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lot not found'; END IF;
  IF v_ski.listing_type <> 'buy_now' THEN RAISE EXCEPTION 'This lot is not a Buy It Now lot'; END IF;
  IF v_ski.status <> 'live' THEN RAISE EXCEPTION 'This lot is no longer available'; END IF;
  IF v_ski.buy_now_price IS NULL THEN RAISE EXCEPTION 'No Buy It Now price set'; END IF;

  SELECT id INTO v_order_id FROM public.vault_orders
   WHERE ski_id = p_ski_id AND user_id = p_user_id AND status = 'pending_charge' LIMIT 1;

  v_price := v_ski.buy_now_price;

  IF v_order_id IS NULL THEN
    INSERT INTO public.vault_orders(ski_id, user_id, hammer_price, shipping_cost, total, status)
    VALUES (p_ski_id, p_user_id, v_price, COALESCE(p_shipping, 0), v_price + COALESCE(p_shipping, 0), 'pending_charge')
    RETURNING id INTO v_order_id;
  END IF;

  UPDATE public.vault_skis SET status = 'sold', current_price = v_price WHERE id = p_ski_id;

  RETURN jsonb_build_object('order_id', v_order_id, 'price', v_price,
                            'total', v_price + COALESCE(p_shipping, 0), 'title', v_ski.title);
END; $$;

REVOKE ALL ON FUNCTION public.vault_claim_buy_now(uuid, uuid, numeric) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_claim_buy_now(uuid, uuid, numeric) TO service_role;