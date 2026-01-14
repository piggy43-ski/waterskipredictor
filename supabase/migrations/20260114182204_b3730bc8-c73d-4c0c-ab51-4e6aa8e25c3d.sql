-- Create market_liability table to track real-time liability per athlete per market
CREATE TABLE public.market_liability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  total_stake_tokens integer NOT NULL DEFAULT 0,
  total_potential_payout integer NOT NULL DEFAULT 0,
  bet_count integer NOT NULL DEFAULT 0,
  liability_if_wins integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(market_id, athlete_id)
);

-- Enable RLS
ALTER TABLE public.market_liability ENABLE ROW LEVEL SECURITY;

-- Admins can read/write market_liability
CREATE POLICY "Admins can manage market_liability"
ON public.market_liability
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Authenticated users can read market_liability (for odds adjustments)
CREATE POLICY "Authenticated users can read market_liability"
ON public.market_liability
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Create risk_config table for platform risk limits
CREATE TABLE public.risk_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.risk_config ENABLE ROW LEVEL SECURITY;

-- Everyone can read risk config
CREATE POLICY "Everyone can read risk_config"
ON public.risk_config
FOR SELECT
USING (true);

-- Only admins can modify
CREATE POLICY "Admins can manage risk_config"
ON public.risk_config
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Insert default risk config values
INSERT INTO public.risk_config (key, value, description) VALUES
('max_stake_tokens', '10000', 'Maximum tokens per single entry'),
('max_payout_tokens', '150000', 'Maximum payout per single entry'),
('liability_cap_winner', '0.35', 'Liability cap as % of market handle for WINNER'),
('liability_cap_podium', '0.30', 'Liability cap as % of market handle for PODIUM'),
('liability_cap_highest_score', '0.30', 'Liability cap for HIGHEST_SCORE'),
('max_athlete_allocation_pct', '0.25', 'Max % of user tournament stake on one athlete');

-- Add athlete_id column to bet_slips for liability tracking
ALTER TABLE public.bet_slips 
  ADD COLUMN IF NOT EXISTS athlete_id uuid REFERENCES public.athletes(id),
  ADD COLUMN IF NOT EXISTS market_id uuid REFERENCES public.markets(id);

-- Create function to update market liability on bet insert
CREATE OR REPLACE FUNCTION public.update_market_liability()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if we have market_id and athlete_id
  IF NEW.market_id IS NOT NULL AND NEW.athlete_id IS NOT NULL THEN
    INSERT INTO public.market_liability (
      market_id, 
      athlete_id, 
      total_stake_tokens, 
      total_potential_payout, 
      bet_count, 
      liability_if_wins
    )
    VALUES (
      NEW.market_id,
      NEW.athlete_id,
      NEW.total_stake_tokens,
      NEW.potential_payout_tokens,
      1,
      NEW.potential_payout_tokens - NEW.total_stake_tokens
    )
    ON CONFLICT (market_id, athlete_id) DO UPDATE SET
      total_stake_tokens = market_liability.total_stake_tokens + EXCLUDED.total_stake_tokens,
      total_potential_payout = market_liability.total_potential_payout + EXCLUDED.total_potential_payout,
      bet_count = market_liability.bet_count + 1,
      liability_if_wins = market_liability.liability_if_wins + EXCLUDED.liability_if_wins,
      updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for bet_slips
CREATE TRIGGER trigger_update_market_liability
AFTER INSERT ON public.bet_slips
FOR EACH ROW
EXECUTE FUNCTION public.update_market_liability();

-- Create index for faster liability lookups
CREATE INDEX idx_market_liability_market_id ON public.market_liability(market_id);
CREATE INDEX idx_market_liability_athlete_id ON public.market_liability(athlete_id);
CREATE INDEX idx_bet_slips_athlete_market ON public.bet_slips(athlete_id, market_id);