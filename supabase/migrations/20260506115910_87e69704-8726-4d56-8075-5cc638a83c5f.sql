
CREATE TABLE public.shadow_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shadow_run_id uuid NOT NULL,
  tournament_id uuid NOT NULL,
  bet_slip_id uuid NOT NULL,
  user_id uuid NOT NULL,
  actual_status text,
  actual_payout_tokens int,
  shadow_status text,
  shadow_payout_tokens int,
  delta_tokens int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.shadow_prediction_legs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shadow_run_id uuid NOT NULL,
  prediction_id uuid NOT NULL,
  bet_slip_id uuid NOT NULL,
  actual_decimal_odds numeric,
  actual_status text,
  shadow_decimal_odds numeric,
  shadow_status text,
  shadow_capped boolean,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_shadow_settlements_run ON public.shadow_settlements(shadow_run_id);
CREATE INDEX idx_shadow_prediction_legs_run ON public.shadow_prediction_legs(shadow_run_id);

ALTER TABLE public.shadow_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadow_prediction_legs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage shadow_settlements" ON public.shadow_settlements
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage shadow_prediction_legs" ON public.shadow_prediction_legs
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
