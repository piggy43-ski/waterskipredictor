-- Create bet_slips table for parlay betting
CREATE TABLE public.bet_slips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'single' CHECK (type IN ('single', 'parlay')),
  total_stake_tokens INTEGER NOT NULL CHECK (total_stake_tokens > 0),
  total_odds_american INTEGER NOT NULL,
  total_odds_decimal NUMERIC NOT NULL CHECK (total_odds_decimal > 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'WON', 'LOST', 'VOID')),
  potential_payout_tokens INTEGER NOT NULL CHECK (potential_payout_tokens > 0),
  actual_payout_tokens INTEGER,
  leg_count INTEGER NOT NULL DEFAULT 1 CHECK (leg_count >= 1 AND leg_count <= 10),
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add bet_slip_id to predictions table
ALTER TABLE public.predictions ADD COLUMN bet_slip_id UUID REFERENCES bet_slips(id) ON DELETE CASCADE;

-- Create index for faster queries
CREATE INDEX idx_bet_slips_user_id ON public.bet_slips(user_id);
CREATE INDEX idx_bet_slips_tournament_id ON public.bet_slips(tournament_id);
CREATE INDEX idx_bet_slips_status ON public.bet_slips(status);
CREATE INDEX idx_predictions_bet_slip_id ON public.predictions(bet_slip_id);

-- Enable RLS
ALTER TABLE public.bet_slips ENABLE ROW LEVEL SECURITY;

-- RLS Policies for bet_slips
CREATE POLICY "Users can view their own bet slips"
  ON public.bet_slips
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bet slips"
  ON public.bet_slips
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bet slips"
  ON public.bet_slips
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can view and update all bet slips
CREATE POLICY "Admins can view all bet slips"
  ON public.bet_slips
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all bet slips"
  ON public.bet_slips
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));