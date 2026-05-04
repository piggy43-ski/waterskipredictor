
CREATE OR REPLACE FUNCTION public.reverse_settlement(
  p_run_id uuid DEFAULT NULL,
  p_slip_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
)
RETURNS TABLE(
  reversed_slip_id uuid,
  compensating_tx_id uuid,
  original_tx_id uuid,
  amount integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx RECORD;
  v_new_tx_id uuid;
  v_actor uuid;
  v_actor_type text;
  v_current_earned integer;
  v_requested_adjustment integer;
BEGIN
  IF (p_run_id IS NULL AND p_slip_id IS NULL) OR (p_run_id IS NOT NULL AND p_slip_id IS NOT NULL) THEN
    RAISE EXCEPTION 'reverse_settlement requires exactly one of p_run_id or p_slip_id (XOR)';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reverse_settlement requires a non-empty reason';
  END IF;

  v_actor := COALESCE(p_actor_id, auth.uid());
  IF v_actor IS NULL THEN
    v_actor_type := 'system';
  ELSIF public.has_role(v_actor, 'admin'::app_role) THEN
    v_actor_type := 'admin';
  ELSE
    RAISE EXCEPTION 'Only admins or service role may reverse settlements';
  END IF;

  FOR v_tx IN
    SELECT tt.*
    FROM token_transactions tt
    WHERE tt.type IN ('prediction_won','prediction_void','bet_won','fantasy_payout','prediction_lost','bet_lost')
      AND (
        (p_run_id IS NOT NULL AND tt.settlement_run_id = p_run_id)
        OR (p_slip_id IS NOT NULL AND tt.reference_id = p_slip_id AND tt.reference_type IN ('prediction','entry','bet_slip'))
      )
      AND NOT EXISTS (
        SELECT 1 FROM token_transactions r
        WHERE r.metadata->>'reverses_tx_id' = tt.id::text
      )
  LOOP
    INSERT INTO token_transactions (
      user_id, type, amount, balance_after,
      reference_type, reference_id, description,
      transaction_status, metadata, settlement_run_id
    ) VALUES (
      v_tx.user_id,
      v_tx.type || '_reversal',
      -v_tx.amount,
      0,
      v_tx.reference_type,
      v_tx.reference_id,
      'Reversal of tx ' || v_tx.id || ': ' || p_reason,
      'completed',
      jsonb_build_object(
        'reverses_tx_id', v_tx.id,
        'reverses_run_id', v_tx.settlement_run_id,
        'reason', p_reason,
        'reversed_by', v_actor,
        'reversed_at', now()
      ),
      v_tx.settlement_run_id
    ) RETURNING id INTO v_new_tx_id;

    IF v_tx.amount <> 0 THEN
      v_requested_adjustment := -v_tx.amount;

      SELECT earned_tokens INTO v_current_earned
      FROM token_wallets
      WHERE user_id = v_tx.user_id
      FOR UPDATE;

      -- Detect overdraw and audit BEFORE clamping.
      IF v_current_earned IS NOT NULL
         AND v_requested_adjustment < 0
         AND (v_current_earned + v_requested_adjustment) < 0 THEN
        INSERT INTO audit_logs (
          actor_type, actor_id, action_type, entity_type, entity_id,
          before_state, after_state, metadata
        ) VALUES (
          v_actor_type, v_actor, 'SETTLEMENT_REVERSAL_OVERDRAW', 'token_wallet', v_tx.user_id::text,
          jsonb_build_object('earned_tokens', v_current_earned),
          jsonb_build_object('clamped_to', 0),
          jsonb_build_object(
            'original_tx_id', v_tx.id,
            'compensating_tx_id', v_new_tx_id,
            'requested_adjustment', v_requested_adjustment,
            'available_balance', v_current_earned,
            'shortfall', -(v_current_earned + v_requested_adjustment),
            'reason', p_reason
          )
        );
      END IF;

      UPDATE token_wallets
      SET earned_tokens = GREATEST(0, COALESCE(v_current_earned, 0) + v_requested_adjustment),
          updated_at = now()
      WHERE user_id = v_tx.user_id;
    END IF;

    INSERT INTO audit_logs (
      actor_type, actor_id, action_type, entity_type, entity_id,
      before_state, after_state, metadata
    ) VALUES (
      v_actor_type, v_actor, 'SETTLEMENT_REVERSED', 'token_transaction', v_tx.id::text,
      to_jsonb(v_tx),
      jsonb_build_object('compensating_tx_id', v_new_tx_id),
      jsonb_build_object('reason', p_reason, 'mode', CASE WHEN p_run_id IS NOT NULL THEN 'run' ELSE 'slip' END)
    );

    reversed_slip_id := v_tx.reference_id::uuid;
    compensating_tx_id := v_new_tx_id;
    original_tx_id := v_tx.id;
    amount := v_tx.amount;
    RETURN NEXT;
  END LOOP;

  IF p_run_id IS NOT NULL THEN
    UPDATE bet_slips
    SET status = 'PENDING', settled_at = NULL, actual_payout_tokens = NULL, settlement_run_id = NULL
    WHERE settlement_run_id = p_run_id AND status IN ('WON','LOST','VOID','SETTLING');
  ELSE
    UPDATE bet_slips
    SET status = 'PENDING', settled_at = NULL, actual_payout_tokens = NULL, settlement_run_id = NULL
    WHERE id = p_slip_id AND status IN ('WON','LOST','VOID','SETTLING');
  END IF;
END;
$$;
