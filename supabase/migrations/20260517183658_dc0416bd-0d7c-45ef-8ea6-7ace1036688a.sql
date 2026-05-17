
-- Tier → cap mapping (deterministic, from spec)
CREATE OR REPLACE FUNCTION public.athlete_cap_pct(p_multiplier numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_multiplier IS NULL THEN 0.25
    WHEN p_multiplier <= 4.0 THEN 0.18
    WHEN p_multiplier <= 7.0 THEN 0.22
    ELSE 0.25
  END;
$$;

-- Capacity check used by validate-entry and admin tooling
CREATE OR REPLACE FUNCTION public.check_athlete_capacity(
  p_market_id uuid,
  p_athlete_id uuid,
  p_added_tokens integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_market_total integer := 0;
  v_athlete_total integer := 0;
  v_multiplier numeric;
  v_cap_pct numeric;
  v_cap_tokens integer;
  v_projected_market integer;
  v_projected_athlete integer;
  v_remaining integer;
BEGIN
  SELECT COALESCE(SUM(total_stake_tokens), 0)
    INTO v_market_total
  FROM market_liability
  WHERE market_id = p_market_id;

  SELECT COALESCE(total_stake_tokens, 0)
    INTO v_athlete_total
  FROM market_liability
  WHERE market_id = p_market_id AND athlete_id = p_athlete_id;

  SELECT final_decimal_odds INTO v_multiplier
  FROM market_odds
  WHERE market_id = p_market_id AND athlete_id = p_athlete_id
  ORDER BY generated_at DESC NULLS LAST
  LIMIT 1;

  v_cap_pct := athlete_cap_pct(v_multiplier);
  v_projected_market := v_market_total + GREATEST(0, p_added_tokens);
  v_projected_athlete := v_athlete_total + GREATEST(0, p_added_tokens);

  -- Cap is computed against the *projected* market handle so the first few
  -- entries don't get instantly blocked. Floor of 5000 token handle baseline.
  v_cap_tokens := FLOOR(GREATEST(v_projected_market, 5000) * v_cap_pct)::int;
  v_remaining := GREATEST(0, v_cap_tokens - v_athlete_total);

  RETURN jsonb_build_object(
    'multiplier', v_multiplier,
    'cap_pct', v_cap_pct,
    'cap_tokens', v_cap_tokens,
    'athlete_total_tokens', v_athlete_total,
    'market_total_tokens', v_market_total,
    'remaining_tokens', v_remaining,
    'at_cap', v_projected_athlete > v_cap_tokens
  );
END;
$$;

-- Worst-case exposure across a tournament (admin pre-publish gate)
CREATE OR REPLACE FUNCTION public.compute_worst_case_liability(p_tournament_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_pct numeric := 0;
  v_division record;
BEGIN
  FOR v_division IN
    SELECT m.id AS market_id,
           m.name,
           MIN(mo.final_decimal_odds) AS top_mult
    FROM markets m
    JOIN market_odds mo ON mo.market_id = m.id
    WHERE m.tournament_id = p_tournament_id
    GROUP BY m.id, m.name
  LOOP
    v_total_pct := v_total_pct + (v_division.top_mult * athlete_cap_pct(v_division.top_mult));
  END LOOP;

  RETURN jsonb_build_object(
    'tournament_id', p_tournament_id,
    'sum_top_mult_times_cap', v_total_pct,
    'note', 'Average per-division worst-case payout as fraction of a 100-token pool'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_athlete_capacity(uuid, uuid, integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.athlete_cap_pct(numeric) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.compute_worst_case_liability(uuid) TO authenticated;
