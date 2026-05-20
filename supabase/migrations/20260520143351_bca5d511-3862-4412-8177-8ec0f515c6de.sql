CREATE TABLE public.market_health_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  market_id uuid NOT NULL,
  tournament_id uuid,
  market_type text NOT NULL,
  field_size integer,
  implied_sum numeric,
  floor_value numeric,
  status text NOT NULL,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  calibration jsonb NOT NULL DEFAULT '{}'::jsonb,
  generator_version text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_market_health_log_market_id ON public.market_health_log(market_id);
CREATE INDEX idx_market_health_log_created_at ON public.market_health_log(created_at DESC);

ALTER TABLE public.market_health_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view market health log"
  ON public.market_health_log
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can insert market health log"
  ON public.market_health_log
  FOR INSERT
  WITH CHECK (true);
