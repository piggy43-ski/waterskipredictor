UPDATE public.tournaments
SET max_handle_tokens = NULL
WHERE max_handle_tokens IS NOT NULL;

INSERT INTO public.markets (tournament_id, discipline, category, market_type, name, locked_at, is_published, published_at)
SELECT
  w.tournament_id,
  w.discipline,
  w.category,
  mt.market_type,
  REPLACE(w.name, '— Winner', CASE mt.market_type WHEN 'PODIUM' THEN '— Podium' ELSE '— Highest Score' END),
  w.locked_at,
  true,
  now()
FROM public.markets w
CROSS JOIN (VALUES ('PODIUM'), ('HIGHEST_SCORE')) AS mt(market_type)
WHERE w.tournament_id = '46e43622-d8e8-433d-b0eb-74c841419a48'
  AND w.market_type = 'WINNER'
  AND NOT EXISTS (
    SELECT 1 FROM public.markets x
    WHERE x.tournament_id = w.tournament_id
      AND x.discipline = w.discipline
      AND x.category = w.category
      AND x.market_type = mt.market_type
  );

INSERT INTO public.market_entries (market_id, athlete_id, is_active)
SELECT new_m.id, me.athlete_id, me.is_active
FROM public.markets new_m
JOIN public.markets w
  ON w.tournament_id = new_m.tournament_id
 AND w.discipline = new_m.discipline
 AND w.category = new_m.category
 AND w.market_type = 'WINNER'
JOIN public.market_entries me ON me.market_id = w.id
WHERE new_m.tournament_id = '46e43622-d8e8-433d-b0eb-74c841419a48'
  AND new_m.market_type IN ('PODIUM', 'HIGHEST_SCORE')
  AND NOT EXISTS (
    SELECT 1 FROM public.market_entries x
    WHERE x.market_id = new_m.id AND x.athlete_id = me.athlete_id
  );