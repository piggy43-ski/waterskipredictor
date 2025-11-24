-- Create athletes table
CREATE TABLE public.athletes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  country TEXT NOT NULL,
  federation TEXT NOT NULL,
  year_of_birth INTEGER NOT NULL,
  disciplines TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tournaments table
CREATE TABLE public.tournaments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  disciplines TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'finished')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create markets table
CREATE TABLE public.markets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  discipline TEXT NOT NULL CHECK (discipline IN ('slalom', 'trick', 'jump')),
  category TEXT NOT NULL CHECK (category IN ('open_men', 'open_women')),
  market_type TEXT NOT NULL CHECK (market_type IN ('WINNER', 'PODIUM', 'HEAD_TO_HEAD', 'OVER_UNDER')),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create selections table
CREATE TABLE public.selections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  decimal_odds NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create rewards table
CREATE TABLE public.rewards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  required_tokens INTEGER NOT NULL,
  partner TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('coaching', 'gear', 'experience')),
  image_url TEXT,
  available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create redemptions table to track reward redemptions
CREATE TABLE public.redemptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  reward_id UUID NOT NULL REFERENCES public.rewards(id) ON DELETE CASCADE,
  tokens_spent INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for athletes (public read)
CREATE POLICY "Athletes are viewable by everyone"
ON public.athletes
FOR SELECT
USING (true);

-- RLS Policies for tournaments (public read)
CREATE POLICY "Tournaments are viewable by everyone"
ON public.tournaments
FOR SELECT
USING (true);

-- RLS Policies for markets (public read)
CREATE POLICY "Markets are viewable by everyone"
ON public.markets
FOR SELECT
USING (true);

-- RLS Policies for selections (public read)
CREATE POLICY "Selections are viewable by everyone"
ON public.selections
FOR SELECT
USING (true);

-- RLS Policies for rewards (public read)
CREATE POLICY "Rewards are viewable by everyone"
ON public.rewards
FOR SELECT
USING (true);

-- RLS Policies for redemptions (users can only see their own)
CREATE POLICY "Users can view their own redemptions"
ON public.redemptions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own redemptions"
ON public.redemptions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Add update trigger for updated_at columns
CREATE TRIGGER update_athletes_updated_at
BEFORE UPDATE ON public.athletes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tournaments_updated_at
BEFORE UPDATE ON public.tournaments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_markets_updated_at
BEFORE UPDATE ON public.markets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_selections_updated_at
BEFORE UPDATE ON public.selections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rewards_updated_at
BEFORE UPDATE ON public.rewards
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_redemptions_updated_at
BEFORE UPDATE ON public.redemptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();