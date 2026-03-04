
Goal: fix why settlement still leaves exactly 13 pending predictions for “BETA TESTING 2”.

What I found
- The 13 pending records are all exact-order PODIUM predictions.
- Their `selection_id` is not a real selection UUID; it is synthetic: `<market_id>-podium`.
- Current admin preview code fetches pending predictions only with:
  - `.in('selection_id', market.selections.map(s => s.id))`
  - so it never fetches `<market_id>-podium` predictions.
- Because those predictions are excluded from preview, their IDs are missing from `prediction_overrides`, so settlement never receives explicit won/lost outcomes for them.
- Edge logs confirm this pattern: settlement runs, settles many entries, but repeatedly skips slips whose legs are still pending (those 13).

Implementation plan

1) Fix admin preview query to include synthetic podium IDs
- File: `src/pages/admin/TournamentSettlement.tsx`
- In `calculateSettlementPreview`, when fetching pending predictions for each market:
  - build `selectionIds = market.selections.map(id)`
  - if `market.market_type === 'PODIUM'`, add `${market.id}-podium`
  - query `.in('selection_id', expandedIds)`
- Result: exact-order podium predictions appear in `winning_prediction_ids` / `losing_prediction_ids`.

2) Ensure settlement payload includes podium synthetic selection contexts
- File: `src/pages/admin/TournamentSettlement.tsx`
- In `settleMutation` when building `selectionsWithResults`:
  - keep existing real selections
  - for PODIUM markets, also append `{ selection_id: `${preview.market_id}-podium`, result: 'lost', actual_results }`
- This ensures backend can associate actual results context with synthetic IDs.

3) Harden backend selection expansion for legacy/synthetic IDs
- File: `supabase/functions/settle-predictions/index.ts`
- Before batch fetch:
  - map provided real selection IDs -> `market_id` from `selections` table
  - add `${market_id}-podium` to fetch list
- This makes backend resilient even if frontend misses some synthetic IDs again.

4) Prevent accidental wrong settlement for synthetic predictions without overrides
- File: `supabase/functions/settle-predictions/index.ts`
- Current synthetic fallback defaults unmatched IDs to `result: 'lost'`.
- Change behavior:
  - if synthetic `-podium` predictions have no explicit override IDs, skip them and return warning/debug details (don’t auto-lose them).
- This avoids silent incorrect losses in future edge cases.

5) Add clearer debug return payload for admin visibility
- Return counts/IDs for:
  - `synthetic_predictions_found`
  - `synthetic_predictions_settled`
  - `synthetic_predictions_skipped_no_override`
- So admin can immediately see why anything remains pending.

Validation plan (after implementation)
1. Run Tournament Settlement for “BETA TESTING 2”.
2. Verify response includes settled synthetic podium predictions.
3. Run:
   - `select count(*) from predictions where tournament_name='BETA TESTING 2' and status='PENDING';`
   - expected result: `0`.
4. Spot-check 2–3 previously pending bet slips now move out of `PENDING`.

Technical note
- No database schema or RLS migration is needed for this fix.
- This is a query/payload/edge-function logic alignment issue between market-selection IDs and synthetic exact-order podium IDs.
