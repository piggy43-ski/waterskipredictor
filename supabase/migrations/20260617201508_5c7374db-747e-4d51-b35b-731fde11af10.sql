CREATE TABLE IF NOT EXISTS public.fantasy_season_standings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  championship_points numeric NOT NULL DEFAULT 0,
  events_played integer NOT NULL DEFAULT 0,
  event_wins integer NOT NULL DEFAULT 0,
  last_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season, user_id)
);

GRANT SELECT ON public.fantasy_season_standings TO anon, authenticated;
GRANT ALL ON public.fantasy_season_standings TO service_role;

CREATE INDEX IF NOT EXISTS idx_fantasy_season_standings_leaderboard
  ON public.fantasy_season_standings (season, championship_points DESC);

ALTER TABLE public.fantasy_season_standings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Season standings are readable by everyone" ON public.fantasy_season_standings;
CREATE POLICY "Season standings are readable by everyone"
  ON public.fantasy_season_standings FOR SELECT USING (true);