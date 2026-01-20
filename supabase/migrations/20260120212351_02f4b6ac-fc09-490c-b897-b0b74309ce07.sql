-- Create market_multiplier_overrides table for manual admin overrides
CREATE TABLE public.market_multiplier_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  manual_multiplier NUMERIC(6,2) NOT NULL,
  is_enabled BOOLEAN DEFAULT true NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(market_id, athlete_id)
);

-- Indexes for performance
CREATE INDEX idx_overrides_market ON public.market_multiplier_overrides(market_id);
CREATE INDEX idx_overrides_athlete ON public.market_multiplier_overrides(athlete_id);
CREATE INDEX idx_overrides_enabled ON public.market_multiplier_overrides(is_enabled) WHERE is_enabled = true;

-- Auto-update timestamp trigger
CREATE TRIGGER update_overrides_updated_at
  BEFORE UPDATE ON public.market_multiplier_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.market_multiplier_overrides ENABLE ROW LEVEL SECURITY;

-- Admins can manage all overrides
CREATE POLICY "Admins can manage overrides" ON public.market_multiplier_overrides
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Public can read enabled overrides (for user UI to fetch final multipliers)
CREATE POLICY "Public can read enabled overrides" ON public.market_multiplier_overrides
  FOR SELECT USING (is_enabled = true);

-- Add table to realtime for live updates in admin UI
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_multiplier_overrides;