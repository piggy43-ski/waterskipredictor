I’ll fix the settlement flow so the results you enter become the single source of truth, and settlement becomes repeatable, auditable, and much harder to get wrong.

Plan:

1. Centralize outcome calculation from tournament results
- Add shared settlement helpers used by both the admin preview and backend settlement.
- Derive all markets from saved `tournament_results`, not from fragile UI-only assumptions:
  - `WINNER`: final round position 1, including ties.
  - `PODIUM`: final round top 3 positions, including ties.
  - `HIGHEST_SCORE`: best score across all rounds, including every tied athlete.
- For slalom, keep discipline-aware score comparison so scores like `1 @ 9.75`, `5 @ 10.25`, etc. rank correctly.
- Preserve exact-order podium behavior: a 1st/2nd/3rd podium slip only wins if all three positions match exactly.

2. Fix backend settlement so singles and parlays/combos cannot drift apart
- Update `settle-predictions` so it settles by `prediction_id` overrides first, not only by `selection_id`.
- Ensure exact-order podium singles with synthetic selection IDs like `<market-id>-podium` are always found and settled.
- Ensure every prediction in a settled slip gets a final status (`WON`, `LOST`, or `VOID`) so users never see a slip as settled while legs still say `PENDING`.
- Restrict entry settlement to the selected tournament only, instead of scanning all pending slips globally.
- For singles, sync `bet_slips.status`, `actual_payout_tokens`, and `predictions.payout_tokens` consistently.
- For parlays/combos, settle the whole slip only after every leg is settled:
  - any lost leg means the slip loses;
  - all winning/void legs means the slip pays from the stored slip payout, using `Math.floor()` / integer payout rules.
- Use the existing stored `potential_payout_tokens` / `total_odds_decimal` as the source of payout instead of recalculating with a different haircut at settlement time.

3. Fix fantasy scoring tie handling
- Update `score-fantasy` highest-score bonus logic to award the +5 bonus to every athlete tied for the highest score in that discipline+gender.
- This specifically covers cases like men’s Nate, Charlie, and Freddy all earning highest-score winner treatment when they all achieved the same top score.
- Keep fantasy points deterministic on rescore: clear/rebuild scoring events, then set each entry’s total from the rebuilt events.

4. Fix fantasy pot settlement ranking and payout ties
- Update `settle-fantasy-pot` to use competition ranking with ties instead of simple array index ranking.
- If multiple fantasy entries have the same `total_points`, they receive the same rank.
- Prize percentages for tied ranks will be pooled and split evenly across the tied entries, with integer rounding via `Math.floor()`.
- Prevent double payouts by checking transaction history/reference before paying a pot, and keep settlement idempotent.

5. Add pre-settlement validation and a clearer admin review
- Add backend validation before final settlement that reports:
  - total pending singles;
  - total pending parlays/combos;
  - exact-order podium entries found;
  - unsettled or missing prediction legs;
  - expected winners per market;
  - expected fantasy pots to score/settle.
- Update the admin settlement screen so the preview reflects entry-level outcomes, not only market-by-market prediction fragments.
- Show warnings when a parlay has any leg not represented in the current result set.
- Stop settlement if validation finds unresolved pending legs for the selected tournament.

6. Strengthen the automated settlement test
- Extend `run-settlement-test` to cover the actual risky cases:
  - normal single winner;
  - losing single;
  - exact-order podium single with synthetic selection ID;
  - parlay/combination with winner + podium + highest-score legs;
  - highest-score tie with multiple winners;
  - fantasy scoring with tied highest score;
  - fantasy pot tie payout.
- Fix the test to use `tournament_results` rather than the older `athlete_results` path, so it tests the real current settlement pipeline.

7. Add a Swiss Pro safety check after implementation
- Run read-only verification against Swiss Pro Slalom after the code changes:
  - no settled Swiss Pro slip should have `PENDING` prediction rows;
  - no winning single should have missing payout fields;
  - every parlay/combination should have leg statuses consistent with slip status;
  - fantasy entries should reflect the corrected tied highest-score bonus.
- If the verification shows remaining Swiss Pro data mismatches, I’ll present the exact data correction before applying it.

Technical notes:
- No direct edits to generated backend client/types files.
- Statuses stay uppercase.
- Payouts stay integer-safe with floor rounding.
- No record deletes for bet slips; corrections stay soft/audited.
- User-facing error messages remain neutral.