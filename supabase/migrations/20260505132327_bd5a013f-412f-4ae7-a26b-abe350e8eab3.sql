-- Allow SETTLING in bet_slips.status
ALTER TABLE public.bet_slips DROP CONSTRAINT IF EXISTS bet_slips_status_check;
ALTER TABLE public.bet_slips ADD CONSTRAINT bet_slips_status_check
  CHECK (status = ANY (ARRAY['PENDING'::text, 'SETTLING'::text, 'WON'::text, 'LOST'::text, 'VOID'::text, 'CANCELLED'::text]));

-- Document the SETTLING gap in rebuild_market_liability without changing behavior.
-- Task A found no scheduled/trigger callers, so under-reporting during a settle window
-- is operational only ("don't click rebuild during settle"). If this becomes wired to
-- a cron or trigger, change WHERE status = 'PENDING' to WHERE status IN ('PENDING','SETTLING').
COMMENT ON FUNCTION public.rebuild_market_liability() IS
'Rebuilds market_liability from bet_slips with status=PENDING. Does NOT include SETTLING slips — safe today because there are no scheduled/trigger callers. If this is wired to cron or a trigger in the future, expand the WHERE clause to include SETTLING to avoid under-reporting liability during a settlement run.';