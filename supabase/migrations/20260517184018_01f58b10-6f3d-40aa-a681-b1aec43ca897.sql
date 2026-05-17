
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

  SELECT COALESCE(SUM(total_stake_tokens), 0)
    INTO v_athlete_total
  FROM market_liability
  WHERE market_id = p_market_id AND athlete_id = p_athlete_id;

  SELECT final_decimal_odds INTO v_multiplier
  FROM market_odds
  WHERE market_id = p_market_id AND athlete_id = p_athlete_id
  ORDER BY generated_at DESC NULLS LAST
  LIMIT 1;

  v_cap_pct := athlete_cap_pct(v_multiplier);
  v_projected_market := COALESCE(v_market_total,0) + GREATEST(0, COALESCE(p_added_tokens,0));
  v_projected_athlete := COALESCE(v_athlete_total,0) + GREATEST(0, COALESCE(p_added_tokens,0));

  v_cap_tokens := FLOOR(GREATEST(v_projected_market, 5000) * v_cap_pct)::int;
  v_remaining := GREATEST(0, v_cap_tokens - COALESCE(v_athlete_total,0));

  RETURN jsonb_build_object(
    'multiplier', v_multiplier,
    'cap_pct', v_cap_pct,
    'cap_tokens', v_cap_tokens,
    'athlete_total_tokens', COALESCE(v_athlete_total,0),
    'market_total_tokens', COALESCE(v_market_total,0),
    'remaining_tokens', v_remaining,
    'at_cap', v_projected_athlete > v_cap_tokens
  );
END;
$$;
