DO $$
DECLARE
  v_pre_total       BIGINT;
  v_post_total      BIGINT;
  v_leftover        INTEGER;
  v_spot_bad        INTEGER;
  v_updated_placed  INTEGER;
  v_updated_won     INTEGER;
  v_updated_lost    INTEGER;
  v_updated_void    INTEGER;
BEGIN
  -- Capture pre-state
  SELECT SUM(amount) INTO v_pre_total FROM token_transactions;

  -- Snapshot 5 random bet_won rows for spot-check
  CREATE TEMP TABLE migration_spotcheck ON COMMIT DROP AS
  SELECT id, user_id, amount, reference_id, type AS old_type
  FROM token_transactions
  WHERE type = 'bet_won'
  ORDER BY random()
  LIMIT 5;

  -- Backfill
  UPDATE token_transactions SET type = 'entry_placed'    WHERE type = 'bet_placed';
  GET DIAGNOSTICS v_updated_placed = ROW_COUNT;

  UPDATE token_transactions SET type = 'prediction_won'  WHERE type = 'bet_won';
  GET DIAGNOSTICS v_updated_won = ROW_COUNT;

  UPDATE token_transactions SET type = 'prediction_lost' WHERE type = 'bet_lost';
  GET DIAGNOSTICS v_updated_lost = ROW_COUNT;

  UPDATE token_transactions SET type = 'prediction_void' WHERE type = 'bet_void';
  GET DIAGNOSTICS v_updated_void = ROW_COUNT;

  -- Verify zero leftover legacy rows
  SELECT COUNT(*) INTO v_leftover
  FROM token_transactions
  WHERE type IN ('bet','bet_placed','bet_won','bet_lost','bet_void');

  IF v_leftover <> 0 THEN
    RAISE EXCEPTION '4C-5 ABORT: % legacy bet_* rows remain after backfill', v_leftover;
  END IF;

  -- Global cross-check: total amount must be identical
  SELECT SUM(amount) INTO v_post_total FROM token_transactions;

  IF v_pre_total IS DISTINCT FROM v_post_total THEN
    RAISE EXCEPTION '4C-5 ABORT: pre_total=% post_total=% mismatch', v_pre_total, v_post_total;
  END IF;

  -- Spot-check: every snapshotted row must now be 'prediction_won' with identical fields
  SELECT COUNT(*) INTO v_spot_bad
  FROM migration_spotcheck sc
  JOIN token_transactions tt ON tt.id = sc.id
  WHERE NOT (
    tt.type = 'prediction_won'
    AND sc.user_id = tt.user_id
    AND sc.amount = tt.amount
    AND sc.reference_id IS NOT DISTINCT FROM tt.reference_id
  );

  IF v_spot_bad <> 0 THEN
    RAISE EXCEPTION '4C-5 ABORT: % of 5 spot-check rows failed integrity check', v_spot_bad;
  END IF;

  RAISE NOTICE '4C-5 OK: placed=% won=% lost=% void=% pre_total=% post_total=%',
    v_updated_placed, v_updated_won, v_updated_lost, v_updated_void, v_pre_total, v_post_total;
END $$;