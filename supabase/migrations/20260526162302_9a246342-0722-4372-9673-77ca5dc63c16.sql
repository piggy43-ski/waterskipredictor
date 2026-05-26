
CREATE OR REPLACE FUNCTION public.get_leaderboard_top(p_limit integer DEFAULT 10)
RETURNS TABLE (
  user_id uuid,
  username text,
  avatar_url text,
  total_staked integer,
  total_won integer,
  net_pnl integer,
  win_count integer,
  total_predictions integer,
  accuracy_pct numeric,
  rank integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH agg AS (
    SELECT bs.user_id,
      sum(bs.total_stake_tokens)::int AS total_staked,
      sum(CASE WHEN bs.status = 'WON' THEN COALESCE(bs.actual_payout_tokens,0) ELSE 0 END)::int AS total_won,
      count(*) FILTER (WHERE bs.status = 'WON')::int AS win_count,
      count(*)::int AS total_predictions
    FROM bet_slips bs
    JOIN tournaments t ON t.id = bs.tournament_id
    WHERE bs.status IN ('WON','LOST') AND t.year = 2026
    GROUP BY bs.user_id
  )
  SELECT a.user_id,
    COALESCE(p.username, 'User #' || right(a.user_id::text, 4)) AS username,
    p.avatar_url,
    a.total_staked,
    a.total_won,
    (a.total_won - a.total_staked) AS net_pnl,
    a.win_count,
    a.total_predictions,
    round(a.win_count::numeric * 100.0 / NULLIF(a.total_predictions,0)::numeric, 1) AS accuracy_pct,
    row_number() OVER (ORDER BY (a.total_won - a.total_staked) DESC, a.total_predictions DESC)::int AS rank
  FROM agg a
  LEFT JOIN profiles p ON p.id = a.user_id
  ORDER BY rank
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_leaderboard_top(integer) TO anon, authenticated;
