-- Add career stats columns for each discipline
ALTER TABLE public.athletes
ADD COLUMN IF NOT EXISTS career_events_slalom INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS career_wins_slalom INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS career_podiums_slalom INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS career_top8_slalom INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS career_events_trick INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS career_wins_trick INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS career_podiums_trick INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS career_top8_trick INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS career_events_jump INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS career_wins_jump INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS career_podiums_jump INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS career_top8_jump INTEGER DEFAULT 0,

-- Add season stats columns for each discipline
ADD COLUMN IF NOT EXISTS season_events_slalom INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS season_wins_slalom INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS season_podiums_slalom INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS season_avg_place_slalom NUMERIC,
ADD COLUMN IF NOT EXISTS season_events_trick INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS season_wins_trick INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS season_podiums_trick INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS season_avg_place_trick NUMERIC,
ADD COLUMN IF NOT EXISTS season_events_jump INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS season_wins_jump INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS season_podiums_jump INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS season_avg_place_jump NUMERIC,

-- Add strength tier columns
ADD COLUMN IF NOT EXISTS strength_tier_slalom TEXT DEFAULT 'unranked',
ADD COLUMN IF NOT EXISTS strength_tier_trick TEXT DEFAULT 'unranked',
ADD COLUMN IF NOT EXISTS strength_tier_jump TEXT DEFAULT 'unranked',

-- Add odds strength score columns
ADD COLUMN IF NOT EXISTS odds_strength_score_slalom NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS odds_strength_score_trick NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS odds_strength_score_jump NUMERIC DEFAULT 0,

-- Add last 5 results tracking (JSONB arrays)
ADD COLUMN IF NOT EXISTS last_5_results_slalom JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS last_5_results_trick JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS last_5_results_jump JSONB DEFAULT '[]'::jsonb;