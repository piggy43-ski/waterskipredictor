
-- Cascade bet_slip cancellation to child predictions
CREATE OR REPLACE FUNCTION public.cascade_slip_cancel_to_predictions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'CANCELLED' AND (OLD.status IS DISTINCT FROM 'CANCELLED') THEN
    UPDATE public.predictions
       SET status = 'VOID',
           settled_at = COALESCE(settled_at, now()),
           settlement_metadata = COALESCE(settlement_metadata, '{}'::jsonb)
                                  || jsonb_build_object(
                                       'voided_reason', 'slip_cancelled',
                                       'voided_at', now()
                                     )
     WHERE bet_slip_id = NEW.id
       AND status = 'PENDING';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_slip_cancel ON public.bet_slips;
CREATE TRIGGER trg_cascade_slip_cancel
AFTER UPDATE OF status ON public.bet_slips
FOR EACH ROW
EXECUTE FUNCTION public.cascade_slip_cancel_to_predictions();

-- Backfill the 2 known stragglers (and any other PENDING predictions whose slip is already CANCELLED)
UPDATE public.predictions p
   SET status = 'VOID',
       settled_at = COALESCE(p.settled_at, now()),
       settlement_metadata = COALESCE(p.settlement_metadata, '{}'::jsonb)
                              || jsonb_build_object(
                                   'voided_reason', 'slip_cancelled_predictions_unsynced',
                                   'backfilled_at', now()
                                 )
  FROM public.bet_slips bs
 WHERE bs.id = p.bet_slip_id
   AND bs.status = 'CANCELLED'
   AND p.status = 'PENDING';
