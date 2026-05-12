
ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS shopify_order_id text,
  ADD COLUMN IF NOT EXISTS shopify_order_url text,
  ADD COLUMN IF NOT EXISTS shopify_gift_card_id text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS carrier text,
  ADD COLUMN IF NOT EXISTS supplier text,
  ADD COLUMN IF NOT EXISTS order_reference text,
  ADD COLUMN IF NOT EXISTS estimated_arrival_date date;

COMMENT ON COLUMN public.redemptions.shopify_order_id IS 'Phase 2: Shopify order ID populated after admin creates order in Shopify';
COMMENT ON COLUMN public.redemptions.shopify_order_url IS 'Phase 2: Direct link to Shopify order admin page';
COMMENT ON COLUMN public.redemptions.shopify_gift_card_id IS 'Phase 2: Shopify gift card ID for store credit redemptions';
COMMENT ON COLUMN public.redemptions.supplier IS 'Manual fulfillment supplier (e.g. Goode, Radar) for elite_skis';
COMMENT ON COLUMN public.redemptions.order_reference IS 'Manual order PO# / confirmation number';
