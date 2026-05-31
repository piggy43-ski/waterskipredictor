CREATE OR REPLACE FUNCTION public.get_user_leaderboard_position(p_user_id uuid)
RETURNS TABLE(rank integer, net_pnl integer, total_predictions integer, accuracy_pct numeric, username text, avatar_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  ),
  ranked AS (
    SELECT a.user_id,
      (a.total_won - a.total_staked) AS net_pnl,
      a.total_predictions,
      a.win_count,
      row_number() OVER (ORDER BY (a.total_won - a.total_staked) DESC, a.total_predictions DESC)::int AS rank
    FROM agg a
  )
  SELECT r.rank,
    r.net_pnl::int,
    r.total_predictions,
    round(r.win_count::numeric * 100.0 / NULLIF(r.total_predictions,0)::numeric, 1) AS accuracy_pct,
    COALESCE(p.username, 'User #' || right(r.user_id::text, 4)) AS username,
    p.avatar_url
  FROM ranked r
  LEFT JOIN profiles p ON p.id = r.user_id
  WHERE r.user_id = p_user_id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_user_leaderboard_position(uuid) TO anon, authenticated;