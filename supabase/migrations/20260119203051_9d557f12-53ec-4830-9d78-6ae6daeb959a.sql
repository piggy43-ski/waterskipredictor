-- Add Safe Mode columns to markets table
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS loss_probability NUMERIC DEFAULT 0;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS expected_profit NUMERIC DEFAULT 0;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS profit_p05 NUMERIC DEFAULT 0;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS safe_mode_status TEXT DEFAULT 'PENDING';
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS last_safe_mode_check TIMESTAMPTZ;

-- Create index for safe mode status queries
CREATE INDEX IF NOT EXISTS idx_markets_safe_mode_status ON public.markets(safe_mode_status);

-- Create safe_mode_jobs table for debounced processing
CREATE TABLE IF NOT EXISTS public.safe_mode_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  CONSTRAINT unique_pending_safe_mode_job UNIQUE (market_id) 
);

-- Create index for pending jobs
CREATE INDEX IF NOT EXISTS idx_safe_mode_jobs_pending ON public.safe_mode_jobs(scheduled_for) WHERE status = 'pending';

-- Enable RLS on safe_mode_jobs
ALTER TABLE public.safe_mode_jobs ENABLE ROW LEVEL SECURITY;

-- Admin-only access to safe_mode_jobs
CREATE POLICY "Admins can manage safe_mode_jobs" ON public.safe_mode_jobs
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Insert default risk config values if not already present
INSERT INTO public.risk_config (key, value, description) VALUES
  ('target_loss_probability', '0.10', 'Maximum acceptable house loss probability (10%)'),
  ('max_risk_ratio_WINNER', '1.15', 'Max risk ratio for WINNER markets'),
  ('max_risk_ratio_PODIUM', '1.10', 'Max risk ratio for PODIUM markets'),
  ('max_risk_ratio_HIGHEST_SCORE', '1.12', 'Max risk ratio for HIGHEST_SCORE markets'),
  ('max_risk_ratio_PARLAY', '1.05', 'Max risk ratio for parlays'),
  ('adjustment_step_max', '0.08', 'Max multiplier adjustment per iteration (8%)'),
  ('min_multiplier', '1.05', 'Floor for multiplier compression'),
  ('recompute_debounce_minutes', '5', 'Min time between safe mode recalculations'),
  ('safe_mode_simulations', '10000', 'Number of simulations for house profit calculation')
ON CONFLICT (key) DO NOTHING;