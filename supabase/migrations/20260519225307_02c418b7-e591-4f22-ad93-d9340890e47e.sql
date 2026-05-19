
-- Platform limits: admin-editable key/value config for caps and other tunables.
-- Seeded for Phase 4 (daily purchase cap). NOT wired into any logic yet.
CREATE TABLE public.platform_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value numeric NOT NULL,
  description text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read platform limits"
  ON public.platform_limits FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert platform limits"
  ON public.platform_limits FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update platform limits"
  ON public.platform_limits FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete platform limits"
  ON public.platform_limits FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_platform_limits_updated_at
  BEFORE UPDATE ON public.platform_limits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.platform_limits (key, value, description) VALUES
  ('DAILY_PURCHASE_CAP_TOKENS', 50000, 'Per-user daily token purchase ceiling (America/New_York reset). Phase 4.'),
  ('SINGLE_PURCHASE_CAP_TOKENS', 32500, 'Per-user single-transaction token purchase ceiling. Phase 4.');
