-- Create probability overrides table
CREATE TABLE public.market_probability_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  manual_probability NUMERIC(8,6) NOT NULL CHECK (manual_probability > 0 AND manual_probability < 1),
  is_enabled BOOLEAN DEFAULT true,
  reason TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(market_id, athlete_id)
);

-- Indexes for performance
CREATE INDEX idx_prob_overrides_market ON market_probability_overrides(market_id);
CREATE INDEX idx_prob_overrides_athlete ON market_probability_overrides(athlete_id);
CREATE INDEX idx_prob_overrides_enabled ON market_probability_overrides(is_enabled) WHERE is_enabled = true;

-- Enable RLS
ALTER TABLE market_probability_overrides ENABLE ROW LEVEL SECURITY;

-- Admins can manage overrides
CREATE POLICY "Admins can manage probability overrides" ON market_probability_overrides
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Public can read enabled overrides (for user UI to fetch final probabilities)
CREATE POLICY "Public can read enabled probability overrides" ON market_probability_overrides
  FOR SELECT USING (is_enabled = true);

-- Add trigger for auto-update timestamp
CREATE TRIGGER update_prob_overrides_updated_at
  BEFORE UPDATE ON market_probability_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();