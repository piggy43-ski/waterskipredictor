-- Create fantasy_transfers table for tracking buy/sell transactions
CREATE TABLE public.fantasy_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID NOT NULL REFERENCES public.fantasy_entries(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  discipline TEXT NOT NULL,
  transfer_type TEXT NOT NULL CHECK (transfer_type IN ('buy', 'sell')),
  price INTEGER NOT NULL,
  transfer_window UUID REFERENCES public.tournaments(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create fantasy_roster_snapshots table for freezing rosters at tournament start
CREATE TABLE public.fantasy_roster_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID NOT NULL REFERENCES public.fantasy_entries(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL DEFAULT '{"athletes": []}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(entry_id, tournament_id)
);

-- Add columns to fantasy_entries for budget tracking
ALTER TABLE public.fantasy_entries 
ADD COLUMN IF NOT EXISTS remaining_budget INTEGER NOT NULL DEFAULT 100000,
ADD COLUMN IF NOT EXISTS transfers_made INTEGER NOT NULL DEFAULT 0;

-- Add columns to fantasy_pots for season configuration
ALTER TABLE public.fantasy_pots
ADD COLUMN IF NOT EXISTS transfer_fee_percent NUMERIC NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_transfers_per_window INTEGER;

-- Enable RLS on new tables
ALTER TABLE public.fantasy_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_roster_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS policies for fantasy_transfers
CREATE POLICY "Users can view their own transfers" 
ON public.fantasy_transfers 
FOR SELECT 
USING (
  entry_id IN (
    SELECT id FROM public.fantasy_entries WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can create transfers for their entries" 
ON public.fantasy_transfers 
FOR INSERT 
WITH CHECK (
  entry_id IN (
    SELECT id FROM public.fantasy_entries WHERE user_id = auth.uid()
  )
);

-- RLS policies for fantasy_roster_snapshots
CREATE POLICY "Users can view their own snapshots" 
ON public.fantasy_roster_snapshots 
FOR SELECT 
USING (
  entry_id IN (
    SELECT id FROM public.fantasy_entries WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Service role can manage snapshots" 
ON public.fantasy_roster_snapshots 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Admins can view all transfers
CREATE POLICY "Admins can view all transfers" 
ON public.fantasy_transfers 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can view all snapshots
CREATE POLICY "Admins can view all snapshots" 
ON public.fantasy_roster_snapshots 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

-- Create indexes for performance
CREATE INDEX idx_fantasy_transfers_entry_id ON public.fantasy_transfers(entry_id);
CREATE INDEX idx_fantasy_transfers_athlete_id ON public.fantasy_transfers(athlete_id);
CREATE INDEX idx_fantasy_transfers_created_at ON public.fantasy_transfers(created_at DESC);
CREATE INDEX idx_fantasy_roster_snapshots_entry_id ON public.fantasy_roster_snapshots(entry_id);
CREATE INDEX idx_fantasy_roster_snapshots_tournament_id ON public.fantasy_roster_snapshots(tournament_id);