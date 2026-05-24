
-- Per-user 2026 season leaderboard
CREATE OR REPLACE VIEW public.leaderboard_season_2026
WITH (security_invoker = true) AS
WITH agg AS (
  SELECT
    bs.user_id,
    SUM(bs.total_stake_tokens)::int AS total_staked,
    SUM(CASE WHEN bs.status = 'WON' THEN COALESCE(bs.actual_payout_tokens, 0) ELSE 0 END)::int AS total_won,
    COUNT(*) FILTER (WHERE bs.status = 'WON')::int AS win_count,
    COUNT(*)::int AS total_predictions
  FROM public.bet_slips bs
  JOIN public.tournaments t ON t.id = bs.tournament_id
  WHERE bs.status IN ('WON', 'LOST')
    AND t.year = 2026
  GROUP BY bs.user_id
)
SELECT
  a.user_id,
  COALESCE(p.username, 'User #' || RIGHT(a.user_id::text, 4)) AS username,
  p.avatar_url,
  a.total_staked,
  a.total_won,
  (a.total_won - a.total_staked) AS net_pnl,
  a.win_count,
  a.total_predictions,
  ROUND(a.win_count * 100.0 / NULLIF(a.total_predictions, 0), 1) AS accuracy_pct,
  ROW_NUMBER() OVER (ORDER BY (a.total_won - a.total_staked) DESC, a.total_predictions DESC)::int AS rank
FROM agg a
LEFT JOIN public.profiles p ON p.id = a.user_id;

GRANT SELECT ON public.leaderboard_season_2026 TO authenticated, anon;

-- Single-user position lookup
CREATE OR REPLACE FUNCTION public.get_user_leaderboard_position(p_user_id uuid)
RETURNS TABLE (
  rank int,
  net_pnl int,
  total_predictions int,
  accuracy_pct numeric,
  username text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rank, net_pnl, total_predictions, accuracy_pct, username, avatar_url
  FROM public.leaderboard_season_2026
  WHERE user_id = p_user_id
$$;

GRANT EXECUTE ON FUNCTION public.get_user_leaderboard_position(uuid) TO authenticated, anon;
